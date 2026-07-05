import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { TranscriptionEngine, EngineWord } from './transcription'

export type MlxEngineKind = 'lightning' | 'parakeet'
export type MlxRuntimeStatus = 'not-installed' | 'installing' | 'ready'

interface SidecarResponse {
  id: number
  ok?: boolean
  words?: EngineWord[]
  error?: string
}

export class MlxRequestRouter {
  private pending = new Map<
    number,
    { resolve: (r: SidecarResponse) => void; reject: (e: Error) => void }
  >()

  register(id: number): Promise<SidecarResponse> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  handleLine(line: string): void {
    let parsed: SidecarResponse
    try {
      parsed = JSON.parse(line) as SidecarResponse
    } catch {
      return
    }
    if (typeof parsed?.id !== 'number') return
    const waiter = this.pending.get(parsed.id)
    if (!waiter) return
    this.pending.delete(parsed.id)
    if (parsed.error) {
      waiter.reject(new Error(parsed.error))
    } else {
      waiter.resolve(parsed)
    }
  }

  rejectAll(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error)
    this.pending.clear()
  }
}

function pcmFloat32ToWav(pcmFloat32: Float32Array, sampleRate: number): Buffer {
  const dataBytes = pcmFloat32.length * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < pcmFloat32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcmFloat32[i]))
    buffer.writeInt16LE(Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), 44 + i * 2)
  }
  return buffer
}

function findUv(): string | null {
  const candidates = [
    '/opt/homebrew/bin/uv',
    '/usr/local/bin/uv',
    join(homedir(), '.local', 'bin', 'uv'),
    join(homedir(), '.cargo', 'bin', 'uv')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export class MlxSidecarManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private router = new MlxRequestRouter()
  private nextRequestId = 1
  private loadedKey: string | null = null
  private status: MlxRuntimeStatus
  private readonly venvDir: string
  private readonly sidecarScript: string
  private readonly spawnFn: typeof spawn

  constructor(options: {
    venvDir: string
    sidecarScript: string
    spawnFn?: typeof spawn
    execFileFn?: typeof execFile
  }) {
    this.venvDir = options.venvDir
    this.sidecarScript = options.sidecarScript
    this.spawnFn = options.spawnFn ?? spawn
    this.status =
      existsSync(this.pythonPath()) && existsSync(join(this.venvDir, '.mint-mlx-ok'))
        ? 'ready'
        : 'not-installed'
  }

  private pythonPath(): string {
    return join(this.venvDir, 'bin', 'python')
  }

  getStatus(): MlxRuntimeStatus {
    return this.status
  }

  async installRuntime(onProgress: (line: string) => void): Promise<void> {
    const uvPath = findUv()
    if (!uvPath) {
      throw new Error('uv is not installed. Install it with: brew install uv')
    }
    this.status = 'installing'
    try {
      await this.runCommand(uvPath, ['venv', this.venvDir, '--python', '3.12'], onProgress)
      await this.runCommand(
        uvPath,
        ['pip', 'install', '--python', this.pythonPath(), 'lightning-whisper-mlx', 'parakeet-mlx'],
        onProgress
      )
      await writeFile(join(this.venvDir, '.mint-mlx-ok'), new Date().toISOString(), 'utf-8')
      this.status = 'ready'
    } catch (installError) {
      this.status = 'not-installed'
      throw installError
    }
  }

  private runCommand(
    command: string,
    args: string[],
    onProgress: (line: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = this.spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      for (const stream of [proc.stdout, proc.stderr]) {
        createInterface({ input: stream }).on('line', onProgress)
      }
      proc.on('error', reject)
      proc.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${command} ${args[0]} exited with code ${code}`))
      )
    })
  }

  private async ensureSidecar(): Promise<void> {
    if (this.child) return
    if (this.status !== 'ready') {
      throw new Error('MLX runtime is not installed. Install it in Settings → Transcription.')
    }
    const child = this.spawnFn(this.pythonPath(), [this.sidecarScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    createInterface({ input: child.stdout }).on('line', (line) => this.router.handleLine(line))
    createInterface({ input: child.stderr }).on('line', (line) =>
      console.error('[MINT] mlx-sidecar:', line)
    )
    child.on('exit', (code) => {
      this.child = null
      this.loadedKey = null
      this.router.rejectAll(new Error(`mlx sidecar exited with code ${code}`))
    })
    child.on('error', (spawnError) => {
      console.error('[MINT] mlx sidecar process error:', spawnError)
      this.child = null
      this.loadedKey = null
      this.router.rejectAll(
        spawnError instanceof Error ? spawnError : new Error(String(spawnError))
      )
    })
    child.stdin.on('error', (stdinError) => {
      // EPIPE after child death — exit handler does the cleanup; just don't crash.
      console.error('[MINT] mlx sidecar stdin error:', stdinError)
    })
  }

  private async request(payload: Record<string, unknown>): Promise<SidecarResponse> {
    await this.ensureSidecar()
    const id = this.nextRequestId++
    const pending = this.router.register(id)
    try {
      this.child!.stdin.write(JSON.stringify({ id, ...payload }) + '\n')
    } catch (writeError) {
      this.router.rejectAll(
        writeError instanceof Error ? writeError : new Error(String(writeError))
      )
    }
    return pending
  }

  async ensureEngine(kind: MlxEngineKind, model: string): Promise<TranscriptionEngine> {
    const key = `${kind}:${model}`
    if (this.loadedKey !== key) {
      // First load downloads the model from Hugging Face — can take minutes.
      await this.request({ cmd: 'load', engine: kind, model })
      this.loadedKey = key
    }
    return {
      submit: async (job) => {
        const wavPath = join(tmpdir(), `mint-mlx-${randomUUID()}.wav`)
        await mkdir(tmpdir(), { recursive: true })
        await writeFile(wavPath, pcmFloat32ToWav(job.pcmFloat32, job.sampleRate))
        try {
          const response = await this.request({ cmd: 'transcribe', path: wavPath })
          return { words: response.words ?? [] }
        } finally {
          void unlink(wavPath).catch(() => {})
        }
      }
    }
  }

  shutdown(): void {
    if (this.child) {
      this.child.stdin.end()
      const child = this.child
      setTimeout(() => child.kill(), 3000)
      this.child = null
    }
    this.loadedKey = null
  }
}
