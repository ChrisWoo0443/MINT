import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  TranscriptionService,
  TranscriptionStartConfig,
  TranscriptResult,
  TranscriptionDegradationKind
} from './transcription'

export type HelperMessage =
  | { type: 'ready' }
  | { type: 'downloading-model' }
  | { type: 'result'; text: string; isFinal: boolean; startMs: number; endMs: number }
  | { type: 'error'; message: string }

export function parseHelperLine(line: string): HelperMessage | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const msg = raw as Record<string, unknown>
  switch (msg.type) {
    case 'ready':
      return { type: 'ready' }
    case 'downloading-model':
      return { type: 'downloading-model' }
    case 'error':
      return typeof msg.message === 'string' ? { type: 'error', message: msg.message } : null
    case 'result':
      if (
        typeof msg.text === 'string' &&
        typeof msg.isFinal === 'boolean' &&
        typeof msg.startMs === 'number' &&
        typeof msg.endMs === 'number'
      ) {
        return {
          type: 'result',
          text: msg.text,
          isFinal: msg.isFinal,
          startMs: msg.startMs,
          endMs: msg.endMs
        }
      }
      return null
    default:
      return null
  }
}

export function defaultHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'speech-transcriber')
    : join(app.getAppPath(), 'resources', 'speech-transcriber')
}

export function isAppleSpeechAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  const darwinMajor = parseInt(release().split('.')[0], 10)
  if (Number.isNaN(darwinMajor) || darwinMajor < 25) return false // macOS 26 == Darwin 25
  return existsSync(defaultHelperPath())
}

export class AppleSpeechService implements TranscriptionService {
  private child: ChildProcessWithoutNullStreams | null = null
  private onResult: ((result: TranscriptResult) => void) | null = null
  private speakerLabel = ''
  private stopped = false
  private degradedListeners: Array<(event: TranscriptionDegradationKind) => void> = []
  private readonly binaryPath: string
  private readonly spawnFn: typeof spawn

  constructor(options: { binaryPath?: string; spawnFn?: typeof spawn } = {}) {
    this.binaryPath = options.binaryPath ?? defaultHelperPath()
    this.spawnFn = options.spawnFn ?? spawn
  }

  onDegraded(callback: (event: TranscriptionDegradationKind) => void): () => void {
    this.degradedListeners.push(callback)
    return () => {
      this.degradedListeners = this.degradedListeners.filter((l) => l !== callback)
    }
  }

  private emitDegraded(event: TranscriptionDegradationKind): void {
    for (const listener of this.degradedListeners) {
      try {
        listener(event)
      } catch (listenerError) {
        console.error('[MINT] apple-speech degraded listener threw:', listenerError)
      }
    }
  }

  async startStreaming(
    _config: TranscriptionStartConfig,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void> {
    this.speakerLabel = speakerLabel
    this.onResult = onResult
    this.stopped = false

    const child = this.spawnFn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child

    child.stderr.on('data', (data: Buffer) => {
      console.error('[MINT] speech-transcriber stderr:', data.toString())
    })

    child.on('exit', (code) => {
      if (this.stopped) return
      this.child = null
      if (code !== 0) {
        this.emitDegraded({ kind: 'terminal', reason: `speech helper exited with code ${code}` })
      }
    })

    const readyPromise = new Promise<void>((resolve, reject) => {
      const readyTimeout = setTimeout(
        () =>
          reject(new Error('speech helper did not become ready (model download may be needed)')),
        120_000
      )
      const rl = createInterface({ input: child.stdout })
      rl.on('line', (line) => {
        const message = parseHelperLine(line)
        if (!message) return
        switch (message.type) {
          case 'ready':
            clearTimeout(readyTimeout)
            resolve()
            break
          case 'downloading-model':
            console.log('[MINT] SpeechAnalyzer model downloading…')
            break
          case 'error':
            clearTimeout(readyTimeout)
            reject(new Error(message.message))
            this.emitDegraded({ kind: 'terminal', reason: message.message })
            break
          case 'result':
            this.onResult?.({
              speaker: this.speakerLabel,
              content: message.text,
              timestampStart: message.startMs / 1000,
              timestampEnd: message.endMs / 1000,
              isFinal: message.isFinal
            })
            break
        }
      })
      child.on('error', (spawnError) => {
        clearTimeout(readyTimeout)
        reject(spawnError)
      })
    })

    await readyPromise
  }

  sendAudio(pcm16: Buffer): void {
    if (this.stopped || !this.child) return
    this.child.stdin.write(pcm16)
  }

  stopStreaming(): void {
    this.stopped = true
    const child = this.child
    this.child = null
    this.onResult = null
    this.degradedListeners = []
    if (child) {
      child.stdin.end() // helper finalizes and exits on EOF
      const killTimer = setTimeout(() => child.kill(), 5000)
      child.on('exit', () => clearTimeout(killTimer))
    }
  }
}
