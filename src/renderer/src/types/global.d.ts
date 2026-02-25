interface TranscriptChunk {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

interface StartRecordingArgs {
  userId: string
  title: string
  accessToken: string
  userName: string
  micDeviceId?: string
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
}

declare global {
  interface Window {
    mintAPI: MintAPI
  }
}

export {}
