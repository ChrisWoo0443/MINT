import { open, type FileHandle } from 'fs/promises'

const HEADER_BYTES = 44

function buildHeader(sampleRate: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES)
  const byteRate = sampleRate * 2 // mono, 16-bit
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36, 4) // patched on close
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // PCM fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(0, 40) // patched on close
  return header
}

export class WavWriter {
  private dataBytes = 0
  private queue: Promise<unknown> = Promise.resolve()
  private closed = false

  private constructor(private readonly handle: FileHandle) {}

  static async create(filePath: string, sampleRate = 16000): Promise<WavWriter> {
    const handle = await open(filePath, 'w')
    await handle.write(buildHeader(sampleRate))
    return new WavWriter(handle)
  }

  append(pcm16: Buffer): void {
    if (this.closed) return
    const copy = Buffer.from(pcm16) // caller may reuse the buffer
    this.dataBytes += copy.length
    this.queue = this.queue
      .then(() => this.handle.write(copy))
      .catch((writeError) => console.error('[MINT] WAV write failed:', writeError))
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.queue
    const riffSize = Buffer.alloc(4)
    riffSize.writeUInt32LE(36 + this.dataBytes)
    await this.handle.write(riffSize, 0, 4, 4)
    const dataSize = Buffer.alloc(4)
    dataSize.writeUInt32LE(this.dataBytes)
    await this.handle.write(dataSize, 0, 4, 40)
    await this.handle.close()
  }
}
