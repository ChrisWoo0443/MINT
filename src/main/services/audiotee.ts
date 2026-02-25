import { AudioTee } from 'audiotee'
import { join } from 'path'

export class AudioTeeService {
  private audioTee: AudioTee | null = null
  private onChunk: ((chunk: Buffer) => void) | null = null

  start(onChunk: (chunk: Buffer) => void): void {
    this.onChunk = onChunk

    const binaryPath = process.resourcesPath ? join(process.resourcesPath, 'audiotee') : undefined

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

    this.audioTee.start()
    console.log('[MINT] AudioTee system audio capture started')
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
