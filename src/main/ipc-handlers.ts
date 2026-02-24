import { ipcMain, BrowserWindow } from 'electron'
import { AudioCaptureService } from './services/audio-capture'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()

  ipcMain.handle('recording:start', async () => {
    mainWindow.webContents.send('recording:status', 'recording')
    audioCaptureService.startCapture(mainWindow, (chunk: Buffer) => {
      console.log(`[AudioCapture] Received audio chunk: ${chunk.length} bytes`)
    })
  })

  ipcMain.handle('recording:stop', async () => {
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
