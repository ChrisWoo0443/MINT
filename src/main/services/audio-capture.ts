import { BrowserWindow } from 'electron'

export class AudioCaptureService {
  private audioChunkHandler: ((chunk: Buffer) => void) | null = null

  startCapture(mainWindow: BrowserWindow, onChunk: (chunk: Buffer) => void): void {
    this.audioChunkHandler = onChunk
    mainWindow.webContents.send('audio:startCapture')
  }

  stopCapture(mainWindow: BrowserWindow): void {
    mainWindow.webContents.send('audio:stopCapture')
    this.audioChunkHandler = null
  }

  handleAudioChunk(chunk: Buffer): void {
    this.audioChunkHandler?.(chunk)
  }
}
