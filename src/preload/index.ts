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
  UpdateCalendarEventPatch
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

  getAudioDevices: () => ipcRenderer.invoke('audio:getDevices'),
  setAudioDevice: (deviceId: string) => ipcRenderer.invoke('audio:setDevice', deviceId),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openApp: (appPath: string) => ipcRenderer.invoke('shell:openApp', appPath),
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
    openaiApiKey?: string
    openaiModel?: string
    notesProvider?: 'openai' | 'ollama'
    ollamaUrl?: string
    ollamaModel?: string
  }) => ipcRenderer.invoke('meetings:generateNotes', args),

  listOpenAIModels: (apiKey: string) => ipcRenderer.invoke('openai:listModels', apiKey),

  calendar: {
    list: (rangeStartISO: string, rangeEndISO: string) =>
      ipcRenderer.invoke('calendar:list', { rangeStartISO, rangeEndISO }),
    get: (id: string) => ipcRenderer.invoke('calendar:get', { id }),
    create: (args: CreateCalendarEventArgs) => ipcRenderer.invoke('calendar:create', args),
    update: (id: string, patch: UpdateCalendarEventPatch) =>
      ipcRenderer.invoke('calendar:update', { id, patch }),
    delete: (id: string) => ipcRenderer.invoke('calendar:delete', { id })
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

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:getStatus'),
    checkNow: () => ipcRenderer.invoke('updates:checkNow'),
    setAutoCheck: (enabled: boolean) => ipcRenderer.invoke('updates:setAutoCheck', enabled),
    openExternal: (url: string) => ipcRenderer.invoke('updates:openExternal', url),
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
let activeProcessors: ScriptProcessorNode[] = []

function convertFloat32ToLinear16(float32Samples: Float32Array): Buffer {
  const pcmBuffer = Buffer.alloc(float32Samples.length * 2)
  for (let i = 0; i < float32Samples.length; i++) {
    const clampedSample = Math.max(-1, Math.min(1, float32Samples[i]))
    const int16Value = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff
    pcmBuffer.writeInt16LE(Math.round(int16Value), i * 2)
  }
  return pcmBuffer
}

function downsampleBuffer(
  inputBuffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputBuffer
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate
  const outputLength = Math.round(inputBuffer.length / sampleRateRatio)
  const outputBuffer = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * sampleRateRatio
    const lowerIndex = Math.floor(sourceIndex)
    const upperIndex = Math.min(lowerIndex + 1, inputBuffer.length - 1)
    const interpolationFactor = sourceIndex - lowerIndex
    outputBuffer[i] =
      inputBuffer[lowerIndex] * (1 - interpolationFactor) +
      inputBuffer[upperIndex] * interpolationFactor
  }
  return outputBuffer
}

function createAudioPipeline(
  source: MediaStreamAudioSourceNode,
  audioContext: AudioContext,
  ipcChannel: string
): ScriptProcessorNode {
  const nativeSampleRate = audioContext.sampleRate
  const processor = audioContext.createScriptProcessor(4096, 1, 1)

  processor.onaudioprocess = (audioProcessingEvent: AudioProcessingEvent): void => {
    const inputChannelData = audioProcessingEvent.inputBuffer.getChannelData(0)
    const downsampledData = downsampleBuffer(inputChannelData, nativeSampleRate, TARGET_SAMPLE_RATE)
    const linear16Chunk = convertFloat32ToLinear16(downsampledData)
    ipcRenderer.send(ipcChannel, linear16Chunk)
  }

  source.connect(processor)
  processor.connect(audioContext.destination)
  return processor
}

async function startAudioCapture(deviceConfig: { micDeviceId: string }): Promise<void> {
  try {
    activeAudioContext = new AudioContext()

    const micConstraints: MediaStreamConstraints = {
      audio:
        deviceConfig.micDeviceId && deviceConfig.micDeviceId !== 'default'
          ? { deviceId: { exact: deviceConfig.micDeviceId } }
          : true
    }
    const micStream = await navigator.mediaDevices.getUserMedia(micConstraints)
    activeStreams.push(micStream)
    const micSource = activeAudioContext.createMediaStreamSource(micStream)
    activeProcessors.push(createAudioPipeline(micSource, activeAudioContext, 'audio:chunk:mic'))
  } catch (captureError) {
    console.error('Failed to start audio capture:', captureError)
  }
}

function stopAudioCapture(): void {
  for (const processor of activeProcessors) {
    processor.disconnect()
    processor.onaudioprocess = null
  }
  activeProcessors = []

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
