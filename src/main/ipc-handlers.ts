import { ipcMain, BrowserWindow } from 'electron'
import { AudioCaptureService } from './services/audio-capture'
import { DeepgramService } from './services/deepgram'
import { GeminiService } from './services/gemini'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()
  const deepgramService = new DeepgramService()
  // GeminiService will be instantiated here in Task 8 once the full
  // transcript is available from Supabase:
  // const geminiService = new GeminiService(process.env.GEMINI_API_KEY || '')
  void GeminiService

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

    // TODO: After fetching the full transcript from Supabase (Task 8),
    // call geminiService.generateNotes(transcript) here to produce
    // structured meeting notes (summary, decisions, action items).
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
