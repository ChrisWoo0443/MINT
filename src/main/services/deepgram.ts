import {
  createClient,
  LiveTranscriptionEvents,
  ListenLiveClient,
  type LiveTranscriptionEvent
} from '@deepgram/sdk'

export interface TranscriptResult {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

export class DeepgramService {
  private connection: ListenLiveClient | null = null
  private onResult: ((result: TranscriptResult) => void) | null = null

  async startStreaming(
    apiKey: string,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void> {
    this.onResult = onResult

    const deepgram = createClient(apiKey)
    this.connection = deepgram.listen.live({
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      punctuate: true,
      diarize: false,
      interim_results: true,
      encoding: 'linear16',
      sample_rate: 16000
    })

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: LiveTranscriptionEvent) => {
      const alternative = data.channel?.alternatives?.[0]
      if (!alternative || !alternative.transcript) return

      const words = alternative.words || []
      const startTime = words.length > 0 ? words[0].start : 0
      const endTime = words.length > 0 ? words[words.length - 1].end : 0

      this.onResult?.({
        speaker: speakerLabel,
        content: alternative.transcript,
        timestampStart: startTime,
        timestampEnd: endTime,
        isFinal: data.is_final ?? false
      })
    })

    this.connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
      console.error('Deepgram error:', error)
    })

    const connection = this.connection
    return new Promise<void>((resolve, reject) => {
      connection.on(LiveTranscriptionEvents.Open, () => resolve())
      connection.on(LiveTranscriptionEvents.Error, (error: unknown) => reject(error))
    })
  }

  sendAudio(audioBuffer: Buffer): void {
    if (this.connection) {
      this.connection.send(
        audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength
        )
      )
    }
  }

  stopStreaming(): void {
    if (this.connection) {
      this.connection.finish()
      this.connection = null
    }
    this.onResult = null
  }
}
