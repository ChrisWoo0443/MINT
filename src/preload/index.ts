import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  MintAPI,
  StartRecordingArgs,
  TranscriptChunk,
  TagDefinition,
  WhisperModelName,
  WhisperDownloadProgress,
  UpdateStatusPayload,
  TranscriptionDegradedEvent,
  CreateCalendarEventArgs,
  UpdateCalendarEventPatch,
  SecretName
} from '../shared/api-types'

const mintAPI: MintAPI = {
  startRecording: (args: StartRecordingArgs) => ipcRenderer.invoke('recording:start', args),
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

  onTranscriptionDegraded: (callback: (event: TranscriptionDegradedEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      degraded: TranscriptionDegradedEvent
    ): void => {
      callback(degraded)
    }
    ipcRenderer.on('transcription:degraded', listener)
    return () => {
      ipcRenderer.removeListener('transcription:degraded', listener)
    }
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  listOllamaModels: (url: string) => ipcRenderer.invoke('ollama:listModels', url),

  listMeetings: () => ipcRenderer.invoke('meetings:list'),
  searchMeetings: (query: string) => ipcRenderer.invoke('meetings:search', query),
  getMeeting: (meetingId: string) => ipcRenderer.invoke('meetings:get', meetingId),
  deleteMeeting: (meetingId: string) => ipcRenderer.invoke('meetings:delete', meetingId),
  renameMeeting: (meetingId: string, newTitle: string) =>
    ipcRenderer.invoke('meetings:rename', meetingId, newTitle),
  getMeetingNotes: (meetingId: string) => ipcRenderer.invoke('meetings:getNotes', meetingId),
  getMeetingTranscripts: (meetingId: string) =>
    ipcRenderer.invoke('meetings:getTranscripts', meetingId),
  getStoragePath: () => ipcRenderer.invoke('storage:getPath'),
  setStoragePath: (newPath: string) => ipcRenderer.invoke('storage:setPath', newPath),
  pickStorageFolder: () => ipcRenderer.invoke('storage:pickFolder'),
  getTags: () => ipcRenderer.invoke('tags:get'),
  saveTags: (tags: TagDefinition[]) => ipcRenderer.invoke('tags:save', tags),
  setMeetingTags: (meetingId: string, tags: string[]) =>
    ipcRenderer.invoke('meetings:setTags', meetingId, tags),
  generateNotes: (args: {
    meetingId: string
    openaiModel?: string
    notesProvider?: 'openai' | 'ollama'
    ollamaUrl?: string
    ollamaModel?: string
    customPrompt?: string
  }) => ipcRenderer.invoke('meetings:generateNotes', args),

  listOpenAIModels: () => ipcRenderer.invoke('openai:listModels'),

  calendar: {
    list: (rangeStartISO: string, rangeEndISO: string) =>
      ipcRenderer.invoke('calendar:list', { rangeStartISO, rangeEndISO }),
    get: (id: string) => ipcRenderer.invoke('calendar:get', { id }),
    create: (args: CreateCalendarEventArgs) => ipcRenderer.invoke('calendar:create', args),
    update: (id: string, patch: UpdateCalendarEventPatch) =>
      ipcRenderer.invoke('calendar:update', { id, patch }),
    delete: (id: string) => ipcRenderer.invoke('calendar:delete', { id })
  },

  secrets: {
    get: (name: SecretName) => ipcRenderer.invoke('secrets:get', name),
    set: (name: SecretName, value: string) => ipcRenderer.invoke('secrets:set', name, value),
    has: (name: SecretName) => ipcRenderer.invoke('secrets:has', name)
  },

  whisper: {
    listModels: () => ipcRenderer.invoke('whisper:listModels'),
    getModelStatus: (name: WhisperModelName) =>
      ipcRenderer.invoke('whisper:getModelStatus', name),
    downloadModel: (name: WhisperModelName) =>
      ipcRenderer.invoke('whisper:downloadModel', name),
    deleteModel: (name: WhisperModelName) => ipcRenderer.invoke('whisper:deleteModel', name),
    onDownloadProgress: (callback: (progress: WhisperDownloadProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: WhisperDownloadProgress
      ): void => {
        callback(progress)
      }
      ipcRenderer.on('whisper:download:progress', listener)
      return () => {
        ipcRenderer.removeListener('whisper:download:progress', listener)
      }
    }
  },

  mlx: {
    getStatus: () => ipcRenderer.invoke('mlx:getStatus'),
    installRuntime: () => ipcRenderer.invoke('mlx:installRuntime'),
    onInstallProgress: (callback: (line: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string): void => callback(line)
      ipcRenderer.on('mlx:install:progress', listener)
      return () => ipcRenderer.removeListener('mlx:install:progress', listener)
    }
  },

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getCapabilities: () => ipcRenderer.invoke('system:getCapabilities'),
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:getStatus'),
    checkNow: () => ipcRenderer.invoke('updates:checkNow'),
    setAutoCheck: (enabled: boolean) => ipcRenderer.invoke('updates:setAutoCheck', enabled),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    onStatus: (callback: (status: UpdateStatusPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatusPayload): void => {
        callback(status)
      }
      ipcRenderer.on('updates:status', listener)
      return () => {
        ipcRenderer.removeListener('updates:status', listener)
      }
    }
  },

  showOverlay: () => ipcRenderer.send('overlay:show'),
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  destroyOverlay: () => ipcRenderer.send('overlay:destroy'),

  onWindowBlur: (callback: () => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('window:blur', listener)
    return () => {
      ipcRenderer.removeListener('window:blur', listener)
    }
  },

  onWindowFocus: (callback: () => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('window:focus', listener)
    return () => {
      ipcRenderer.removeListener('window:focus', listener)
    }
  }
}

// --- Audio capture (renderer-side for macOS BlackHole + microphone) ---

const TARGET_SAMPLE_RATE = 16000

let activeStreams: MediaStream[] = []
let activeAudioContext: AudioContext | null = null
let activeWorkletNodes: AudioWorkletNode[] = []

// 1600 samples @ 16 kHz = 100 ms per chunk — comparable cadence to the old
// 4096-sample ScriptProcessor at 48 kHz.
const CHUNK_SIZE_SAMPLES = 1600

function convertFloat32ToLinear16(float32Samples: Float32Array): Buffer {
  const pcmBuffer = Buffer.alloc(float32Samples.length * 2)
  for (let i = 0; i < float32Samples.length; i++) {
    const clampedSample = Math.max(-1, Math.min(1, float32Samples[i]))
    const int16Value = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff
    pcmBuffer.writeInt16LE(Math.round(int16Value), i * 2)
  }
  return pcmBuffer
}

async function createAudioPipeline(
  source: MediaStreamAudioSourceNode,
  audioContext: AudioContext,
  ipcChannel: string
): Promise<AudioWorkletNode> {
  const workletNode = new AudioWorkletNode(audioContext, 'pcm-downsampler', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE, chunkSize: CHUNK_SIZE_SAMPLES }
  })
  workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    ipcRenderer.send(ipcChannel, convertFloat32ToLinear16(event.data))
  }
  source.connect(workletNode)
  // The processor writes no output (silence); connecting keeps the graph alive.
  workletNode.connect(audioContext.destination)
  return workletNode
}

async function startAudioCapture(deviceConfig: { micDeviceId: string }): Promise<void> {
  try {
    activeAudioContext = new AudioContext()
    await activeAudioContext.audioWorklet.addModule(
      new URL('pcm-worklet.js', window.location.href).toString()
    )

    const micConstraints: MediaStreamConstraints = {
      audio:
        deviceConfig.micDeviceId && deviceConfig.micDeviceId !== 'default'
          ? { deviceId: { exact: deviceConfig.micDeviceId } }
          : true
    }
    const micStream = await navigator.mediaDevices.getUserMedia(micConstraints)
    activeStreams.push(micStream)
    const micSource = activeAudioContext.createMediaStreamSource(micStream)
    activeWorkletNodes.push(
      await createAudioPipeline(micSource, activeAudioContext, 'audio:chunk:mic')
    )
  } catch (captureError) {
    console.error('Failed to start audio capture:', captureError)
  }
}

function stopAudioCapture(): void {
  for (const node of activeWorkletNodes) {
    node.port.onmessage = null
    node.disconnect()
  }
  activeWorkletNodes = []

  if (activeAudioContext) {
    activeAudioContext.close().catch((closeError) => {
      console.error('Error closing AudioContext:', closeError)
    })
    activeAudioContext = null
  }

  for (const stream of activeStreams) {
    stream.getTracks().forEach((track) => track.stop())
  }
  activeStreams = []
}

ipcRenderer.on('audio:startCapture', (_event, deviceConfig: { micDeviceId: string }) => {
  startAudioCapture(deviceConfig)
})

ipcRenderer.on('audio:stopCapture', () => {
  stopAudioCapture()
})

// --- End audio capture ---

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
