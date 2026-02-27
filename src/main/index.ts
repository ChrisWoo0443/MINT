import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

let overlayWindow: BrowserWindow | null = null

function createOverlayWindow(): BrowserWindow {
  const overlay = new BrowserWindow({
    width: 320,
    height: 220,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    vibrancy: 'under-window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?overlay=1`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { overlay: '1' }
    })
  }

  overlay.on('closed', () => {
    overlayWindow = null
  })

  return overlay
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  ipcMain.on('overlay:show', () => {
    try {
      if (!overlayWindow) {
        overlayWindow = createOverlayWindow()
      }
      overlayWindow?.showInactive()
    } catch (error) {
      console.error('Failed to show overlay:', error)
      overlayWindow = null
    }
  })

  ipcMain.on('overlay:hide', () => {
    overlayWindow?.hide()
  })

  ipcMain.on('overlay:destroy', () => {
    overlayWindow?.close()
    overlayWindow = null
  })

  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window:blur')
  })

  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window:focus')
    overlayWindow?.hide()
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
