// Shared API type definitions for the IPC surface exposed by the preload
// script (`mintAPI`). These types are consumed by the preload runtime
// (`src/preload/index.ts`), the preload ambient declarations
// (`src/preload/index.d.ts`), and the renderer global Window augmentation
// (`src/renderer/src/types/global.d.ts`). Keep this file as the single
// source of truth — do not redefine these shapes elsewhere.

export interface TranscriptChunk {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

export interface StartRecordingArgs {
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

export interface MeetingMetadata {
  id: string
  title: string
  status: string
  startedAt: string
  endedAt: string | null
  tags?: string[]
}

export interface NoteData {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

export interface TranscriptEntryData {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
}

export interface TagDefinition {
  id: string
  name: string
  color: string
}

export type WhisperModelName = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en'
export type WhisperModelStatus = 'not-downloaded' | 'downloading' | 'ready'

export interface WhisperModelInfo {
  name: WhisperModelName
  sizeMB: number
  downloaded: boolean
  path: string
}

export interface WhisperDownloadProgress {
  name: WhisperModelName
  bytesDownloaded: number
  bytesTotal: number
}

export interface UpdateInfoPayload {
  version: string
  releaseUrl: string
}

export type UpdateStatusPayload =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfoPayload; checkedAt: number }
  | { kind: 'error'; message: string; checkedAt: number }
  | { kind: 'disabled' }

export interface MintAPI {
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
  searchMeetings: (query: string) => Promise<MeetingMetadata[]>
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
