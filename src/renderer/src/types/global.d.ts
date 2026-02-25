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
}

declare global {
  interface Window {
    mintAPI: MintAPI
  }
}

export {}
