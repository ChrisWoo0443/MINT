import { ipcMain, BrowserWindow } from 'electron'
import { AudioCaptureService } from './services/audio-capture'
import { DeepgramService } from './services/deepgram'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()
  const deepgramService = new DeepgramService()

  ipcMain.handle('recording:start', async () => {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY || ''

    await deepgramService.startStreaming(deepgramApiKey, (result) => {
      mainWindow.webContents.send('transcript:chunk', result)
    })

    mainWindow.webContents.send('recording:status', 'recording')
    audioCaptureService.startCapture(mainWindow, (chunk: Buffer) => {
      deepgramService.sendAudio(chunk)
    })
  })

  ipcMain.handle('recording:stop', async () => {
    deepgramService.stopStreaming()
    audioCaptureService.stopCapture(mainWindow)
    mainWindow.webContents.send('recording:status', 'stopped')
  })

  ipcMain.on('audio:chunk', (_event, chunk: Buffer) => {
    audioCaptureService.handleAudioChunk(chunk)
  })

  ipcMain.handle('audio:getDevices', async () => {
    // Will be implemented in a future task
    return []
  })

  ipcMain.handle('audio:setDevice', async (_event, _deviceId: string) => {
    // Will be implemented in a future task
  })
}
