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
  openaiModel?: string
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

export interface CalendarEvent {
  id: string
  title: string
  startISO: string
  endISO: string
  notes?: string
  tagId?: string
  meetingId?: string
  createdAt: string
  updatedAt: string
}

export interface EventsFile {
  version: 1
  events: CalendarEvent[]
}

export interface CreateCalendarEventArgs {
  title: string
  startISO: string
  endISO: string
  notes?: string
  tagId?: string
}

export interface UpdateCalendarEventPatch {
  title?: string
  startISO?: string
  endISO?: string
  notes?: string
  tagId?: string
  meetingId?: string
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

export type TranscriptionDegradedSource = 'mic' | 'system'

export type TranscriptionDegradedEvent =
  | {
      kind: 'reconnecting'
      source: TranscriptionDegradedSource
      attempt: number
      nextDelayMs: number
    }
  | { kind: 'recovered'; source: TranscriptionDegradedSource }
  | {
      kind: 'dropped'
      source: TranscriptionDegradedSource
      droppedBytes: number
      reason: string
    }
  | { kind: 'terminal'; source: TranscriptionDegradedSource; reason: string }

export interface MintAPI {
  startRecording: (args: StartRecordingArgs) => Promise<string>
  stopRecording: () => Promise<void>
  onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
  onRecordingStatus: (callback: (status: string) => void) => () => void
  onTranscriptionDegraded: (callback: (event: TranscriptionDegradedEvent) => void) => () => void
  getAudioDevices: () => Promise<MediaDeviceInfo[]>
  setAudioDevice: (deviceId: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  openApp: (appPath: string) => Promise<string>
  listOllamaModels: (url: string) => Promise<string[] | null>
  listOpenAIModels: (apiKey: string) => Promise<string[] | null>
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
    openaiModel?: string
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
  calendar: {
    list: (rangeStartISO: string, rangeEndISO: string) => Promise<CalendarEvent[]>
    get: (id: string) => Promise<CalendarEvent | null>
    create: (args: CreateCalendarEventArgs) => Promise<CalendarEvent>
    update: (id: string, patch: UpdateCalendarEventPatch) => Promise<CalendarEvent>
    delete: (id: string) => Promise<void>
  }
}
