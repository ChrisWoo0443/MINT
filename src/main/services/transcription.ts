export interface TranscriptResult {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

export interface TranscriptionStartConfig {
  deepgramApiKey?: string
  whisperModelName?: string
  whisperEngine?: unknown
}

export interface TranscriptionService {
  startStreaming(
    config: TranscriptionStartConfig,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void>
  sendAudio(pcm16: Buffer): void
  stopStreaming(): void
}
