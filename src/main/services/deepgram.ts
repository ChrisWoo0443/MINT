import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export interface TranscriptResult {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
  isFinal: boolean
}

export class DeepgramService {
  private connection: any | null = null
  private onResult: ((result: TranscriptResult) => void) | null = null

  async startStreaming(
    apiKey: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void> {
    this.onResult = onResult

    const deepgram = createClient(apiKey)
    this.connection = deepgram.listen.live({
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      punctuate: true,
      diarize: true,
      interim_results: true,
      encoding: 'linear16',
      sample_rate: 16000
    })

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alternative = data.channel?.alternatives?.[0]
      if (!alternative || !alternative.transcript) return

      const words = alternative.words || []
      const speaker = words.length > 0 ? `Speaker ${words[0].speaker ?? 0}` : null
      const startTime = words.length > 0 ? words[0].start : 0
      const endTime = words.length > 0 ? words[words.length - 1].end : 0

      this.onResult?.({
        speaker,
        content: alternative.transcript,
        timestampStart: startTime,
        timestampEnd: endTime,
        isFinal: data.is_final ?? false
      })
    })

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('Deepgram error:', error)
    })
  }

  sendAudio(audioBuffer: Buffer): void {
    if (this.connection) {
      this.connection.send(audioBuffer)
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
