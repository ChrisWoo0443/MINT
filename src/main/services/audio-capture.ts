import { BrowserWindow } from 'electron'

export interface AudioDeviceConfig {
  micDeviceId: string
}

export class AudioCaptureService {
  startCapture(mainWindow: BrowserWindow, deviceConfig: AudioDeviceConfig): void {
    mainWindow.webContents.send('audio:startCapture', deviceConfig)
  }

  stopCapture(mainWindow: BrowserWindow): void {
    mainWindow.webContents.send('audio:stopCapture')
  }
}
