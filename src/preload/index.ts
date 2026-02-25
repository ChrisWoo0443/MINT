import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface TranscriptChunk {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

interface StartRecordingArgs {
  title: string
  userName: string
  micDeviceId?: string
}

interface MeetingMetadata {
  id: string
  title: string
  status: string
  startedAt: string
  endedAt: string | null
  tags?: string[]
}

interface NoteData {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

interface TranscriptEntryData {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
}

interface TagDefinition {
  id: string
  name: string
  color: string
}

interface MintAPI {
  startRecording: (args: StartRecordingArgs) => Promise<void>
  stopRecording: () => Promise<void>
  onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
  onRecordingStatus: (callback: (status: string) => void) => () => void
  getAudioDevices: () => Promise<MediaDeviceInfo[]>
  setAudioDevice: (deviceId: string) => Promise<void>
  onTrayStartRecording: (callback: () => void) => () => void
  onTrayStopRecording: (callback: () => void) => () => void
  updateTrayRecordingState: (isRecording: boolean) => void
  openExternal: (url: string) => Promise<void>
  openApp: (appPath: string) => Promise<string>
  listOllamaModels: (url: string) => Promise<string[] | null>
  listMeetings: () => Promise<MeetingMetadata[]>
  getMeeting: (meetingId: string) => Promise<MeetingMetadata>
  deleteMeeting: (meetingId: string) => Promise<void>
  renameMeeting: (meetingId: string, newTitle: string) => Promise<void>
  getMeetingNotes: (meetingId: string) => Promise<NoteData | null>
  getMeetingTranscripts: (meetingId: string) => Promise<TranscriptEntryData[]>
  getStoragePath: () => Promise<string>
  setStoragePath: (newPath: string) => Promise<void>
  pickStorageFolder: () => Promise<string | null>
  getTags: () => Promise<TagDefinition[]>
  saveTags: (tags: TagDefinition[]) => Promise<void>
  setMeetingTags: (meetingId: string, tags: string[]) => Promise<void>
}

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

  getAudioDevices: () => ipcRenderer.invoke('audio:getDevices'),
  setAudioDevice: (deviceId: string) => ipcRenderer.invoke('audio:setDevice', deviceId),

  onTrayStartRecording: (callback: () => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('tray:startRecording', listener)
    return () => {
      ipcRenderer.removeListener('tray:startRecording', listener)
    }
  },

  onTrayStopRecording: (callback: () => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('tray:stopRecording', listener)
    return () => {
      ipcRenderer.removeListener('tray:stopRecording', listener)
    }
  },

  updateTrayRecordingState: (isRecording: boolean) => {
    ipcRenderer.send('tray:updateRecordingState', isRecording)
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openApp: (appPath: string) => ipcRenderer.invoke('shell:openApp', appPath),
  listOllamaModels: (url: string) => ipcRenderer.invoke('ollama:listModels', url),

  listMeetings: () => ipcRenderer.invoke('meetings:list'),
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
    ipcRenderer.invoke('meetings:setTags', meetingId, tags)
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
