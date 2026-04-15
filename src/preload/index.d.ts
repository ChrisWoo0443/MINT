import { ElectronAPI } from '@electron-toolkit/preload'

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
  deepgramApiKey?: string
  transcriptionProvider?: 'local' | 'deepgram'
  whisperModel?: 'tiny.en' | 'base.en' | 'small.en' | 'medium.en'
  openaiApiKey?: string
  notesProvider?: 'openai' | 'ollama'
  ollamaUrl?: string
  ollamaModel?: string
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

type WhisperModelName = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en'
type WhisperModelStatus = 'not-downloaded' | 'downloading' | 'ready'

interface WhisperModelInfo {
  name: WhisperModelName
  sizeMB: number
  downloaded: boolean
  path: string
}

interface WhisperDownloadProgress {
  name: WhisperModelName
  bytesDownloaded: number
  bytesTotal: number
}

interface UpdateInfoPayload {
  version: string
  releaseName: string
  releaseUrl: string
  downloadUrl: string
  releaseNotes: string
}

type UpdateStatusPayload =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfoPayload; checkedAt: number }
  | { kind: 'error'; message: string; checkedAt: number }
  | { kind: 'disabled' }

interface MintAPI {
  startRecording: (args: StartRecordingArgs) => Promise<void>
  stopRecording: () => Promise<void>
  onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
  onRecordingStatus: (callback: (status: string) => void) => () => void
  getAudioDevices: () => Promise<MediaDeviceInfo[]>
  setAudioDevice: (deviceId: string) => Promise<void>
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
  generateNotes: (args: {
    meetingId: string
    openaiApiKey?: string
    notesProvider?: 'openai' | 'ollama'
    ollamaUrl?: string
    ollamaModel?: string
  }) => Promise<NoteData>
  whisper: {
    listModels: () => Promise<WhisperModelInfo[]>
    getModelStatus: (name: WhisperModelName) => Promise<WhisperModelStatus>
    downloadModel: (name: WhisperModelName) => Promise<void>
    deleteModel: (name: WhisperModelName) => Promise<void>
    onDownloadProgress: (
      callback: (progress: WhisperDownloadProgress) => void
    ) => () => void
  }
  getAppVersion: () => Promise<string>
  updates: {
    getStatus: () => Promise<UpdateStatusPayload>
    checkNow: () => Promise<void>
    setAutoCheck: (enabled: boolean) => Promise<void>
    openExternal: (url: string) => Promise<void>
    onStatus: (callback: (status: UpdateStatusPayload) => void) => () => void
  }
  showOverlay: () => void
  hideOverlay: () => void
  destroyOverlay: () => void
  onWindowBlur: (callback: () => void) => () => void
  onWindowFocus: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    mintAPI: MintAPI
  }
}
