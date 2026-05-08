import type { MintAPI } from '../../../shared/api-types'

export type {
  TranscriptChunk,
  StartRecordingArgs,
  MeetingMetadata,
  NoteData,
  TranscriptEntryData,
  TagDefinition,
  WhisperModelName,
  WhisperModelStatus,
  WhisperModelInfo,
  WhisperDownloadProgress,
  UpdateInfoPayload,
  UpdateStatusPayload,
  TranscriptionDegradedEvent,
  TranscriptionDegradedSource,
  MintAPI
} from '../../../shared/api-types'

declare global {
  interface Window {
    mintAPI: MintAPI
  }
}
