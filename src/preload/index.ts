import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface TranscriptChunk {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

interface MintAPI {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
  onRecordingStatus: (callback: (status: string) => void) => () => void
  getAudioDevices: () => Promise<MediaDeviceInfo[]>
  setAudioDevice: (deviceId: string) => Promise<void>
}

const mintAPI: MintAPI = {
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),

  onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: TranscriptChunk): void => {
      callback(chunk)
    }
    ipcRenderer.on('transcript:chunk', listener)
    return () => {
      ipcRenderer.removeListener('transcript:chunk', listener)
    }
  },

  onRecordingStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('recording:status', listener)
    return () => {
      ipcRenderer.removeListener('recording:status', listener)
    }
  },

  getAudioDevices: () => ipcRenderer.invoke('audio:getDevices'),
  setAudioDevice: (deviceId: string) => ipcRenderer.invoke('audio:setDevice', deviceId)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('mintAPI', mintAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.mintAPI = mintAPI
}
