import { AudioTee } from 'audiotee'
import { app } from 'electron'
import { join } from 'path'

export class AudioTeeService {
  private audioTee: AudioTee | null = null
  private onChunk: ((chunk: Buffer) => void) | null = null

  async start(onChunk: (chunk: Buffer) => void): Promise<void> {
    this.onChunk = onChunk

    const binaryPath = app.isPackaged ? join(process.resourcesPath, 'audiotee') : undefined

    this.audioTee = new AudioTee({
      sampleRate: 16000,
      binaryPath
    })

    this.audioTee.on('data', (chunk) => {
      this.onChunk?.(chunk.data)
    })

    this.audioTee.on('error', (error) => {
      console.error('[MINT] AudioTee error:', error)
    })

    await this.audioTee.start()
  }

  stop(): void {
    if (this.audioTee) {
      this.audioTee.stop()
      this.audioTee = null
    }
    this.onChunk = null
    console.log('[MINT] AudioTee system audio capture stopped')
  }
}
