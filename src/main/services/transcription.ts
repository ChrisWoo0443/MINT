export interface TranscriptResult {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

export interface EngineWord {
  text: string
  endMs: number
}

/**
 * A local speech-to-text engine that transcribes one audio window at a time.
 * WhisperEngine (smart-whisper) and MlxEngine (python sidecar) both satisfy it;
 * LocalWhisperService drives either through its rolling-window scheduler.
 */
export interface TranscriptionEngine {
  submit(job: { pcmFloat32: Float32Array; sampleRate: number }): Promise<{ words: EngineWord[] }>
}

export interface TranscriptionStartConfig {
  deepgramApiKey?: string
  deepgramModel?: string
  deepgramDiarize?: boolean
  whisperModelName?: string
  whisperEngine?: unknown
}

export type TranscriptionDegradationKind =
  | { kind: 'reconnecting'; attempt: number; nextDelayMs: number }
  | { kind: 'recovered' }
  | { kind: 'dropped'; droppedBytes: number; reason: string }
  | { kind: 'terminal'; reason: string }

export interface TranscriptionService {
  startStreaming(
    config: TranscriptionStartConfig,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void>
  sendAudio(pcm16: Buffer): void
  stopStreaming(): void
  /**
   * Optional. Subscribe to degradation events (reconnect attempts, dropped
   * audio, terminal failure). Returns an unsubscribe function. Implementations
   * that have no transient-failure surface (e.g. in-process whisper) may omit
   * this method entirely.
   */
  onDegraded?(callback: (event: TranscriptionDegradationKind) => void): () => void
}
