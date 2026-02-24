import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import path from 'path'

export class TrayManager {
  private tray: Tray | null = null
  private isRecording = false
  private onStartRecording: () => void
  private onStopRecording: () => void
  private mainWindow: BrowserWindow

  constructor(
    mainWindow: BrowserWindow,
    onStartRecording: () => void,
    onStopRecording: () => void
  ) {
    this.mainWindow = mainWindow
    this.onStartRecording = onStartRecording
    this.onStopRecording = onStopRecording
  }

  create(): void {
    const iconPath = path.join(__dirname, '../../resources/icon.png')
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    icon.setTemplateImage(true)

    this.tray = new Tray(icon)
    this.tray.setToolTip('MINT')
    this.updateMenu()
  }

  setRecording(recording: boolean): void {
    this.isRecording = recording
    this.updateMenu()
  }

  private updateMenu(): void {
    if (!this.tray) return

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.isRecording ? 'Stop Recording' : 'Start Recording',
        click: (): void => {
          if (this.isRecording) {
            this.onStopRecording()
          } else {
            this.onStartRecording()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: (): void => {
          this.mainWindow.show()
          this.mainWindow.focus()
        }
      },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' }
    ])

    this.tray.setContextMenu(contextMenu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
