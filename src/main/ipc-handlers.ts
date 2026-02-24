import { ipcMain, BrowserWindow } from 'electron'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('recording:start', async () => {
    mainWindow.webContents.send('recording:status', 'recording')
    // Will be implemented in audio capture task
  })

  ipcMain.handle('recording:stop', async () => {
    mainWindow.webContents.send('recording:status', 'stopped')
    // Will be implemented in audio capture task
  })

  ipcMain.handle('audio:getDevices', async () => {
    // Will be implemented in audio capture task
    return []
  })

  ipcMain.handle('audio:setDevice', async (_event, _deviceId: string) => {
    // Will be implemented in audio capture task
  })
}
