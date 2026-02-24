import { BrowserWindow, desktopCapturer } from 'electron'

export class AudioCaptureService {
  private audioChunkHandler: ((chunk: Buffer) => void) | null = null

  async startCapture(mainWindow: BrowserWindow, onChunk: (chunk: Buffer) => void): Promise<void> {
    this.audioChunkHandler = onChunk

    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    const sourceId = sources.length > 0 ? sources[0].id : ''

    mainWindow.webContents.send('audio:startCapture', sourceId)
  }

  stopCapture(mainWindow: BrowserWindow): void {
    mainWindow.webContents.send('audio:stopCapture')
    this.audioChunkHandler = null
  }

  handleAudioChunk(chunk: Buffer): void {
    this.audioChunkHandler?.(chunk)
  }
}
