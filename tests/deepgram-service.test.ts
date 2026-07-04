import { describe, it, expect } from 'vitest'
import { LiveTranscriptionEvents } from '@deepgram/sdk'
import {
  DeepgramService,
  type DeepgramConnectionLike,
  type DeepgramLiveConfig
} from '../src/main/services/deepgram'
import type { TranscriptResult } from '../src/main/services/transcription'

class FakeConnection implements DeepgramConnectionLike {
  listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? []
    list.push(listener)
    this.listeners.set(event, list)
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  off(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  send(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  finish(): void {}
  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
  }
}

async function startService(config: {
  deepgramModel?: string
  deepgramDiarize?: boolean
}): Promise<{
  connection: FakeConnection
  liveConfig: DeepgramLiveConfig
  results: TranscriptResult[]
}> {
  const connection = new FakeConnection()
  let capturedConfig: DeepgramLiveConfig | null = null
  const service = new DeepgramService({
    connectionFactory: (_key, live) => {
      capturedConfig = live
      return connection
    }
  })
  const results: TranscriptResult[] = []
  const startPromise = service.startStreaming(
    { deepgramApiKey: 'dg-key', ...config },
    'Meeting Users',
    (result) => results.push(result)
  )
  connection.emit(LiveTranscriptionEvents.Open)
  await startPromise
  return { connection, liveConfig: capturedConfig!, results }
}

describe('DeepgramService configuration', () => {
  it('defaults to nova-3 with diarization off', async () => {
    const { liveConfig } = await startService({})
    expect(liveConfig).toEqual({ model: 'nova-3', diarize: false })
  })

  it('passes through the configured model and diarize flag', async () => {
    const { liveConfig } = await startService({ deepgramModel: 'nova-2', deepgramDiarize: true })
    expect(liveConfig).toEqual({ model: 'nova-2', diarize: true })
  })
})

describe('DeepgramService diarized transcripts', () => {
  const diarizedFinal = {
    is_final: true,
    channel: {
      alternatives: [
        {
          transcript: 'hello there general kenobi',
          words: [
            { word: 'hello', punctuated_word: 'Hello', start: 0.0, end: 0.4, speaker: 0 },
            { word: 'there', punctuated_word: 'there.', start: 0.4, end: 0.8, speaker: 0 },
            { word: 'general', punctuated_word: 'General', start: 1.0, end: 1.4, speaker: 1 },
            { word: 'kenobi', punctuated_word: 'Kenobi.', start: 1.4, end: 1.9, speaker: 1 }
          ]
        }
      ]
    }
  }

  it('splits a diarized final into one result per speaker run', async () => {
    const { connection, results } = await startService({ deepgramDiarize: true })
    connection.emit(LiveTranscriptionEvents.Transcript, diarizedFinal)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      speaker: 'Speaker 1',
      content: 'Hello there.',
      timestampStart: 0.0,
      timestampEnd: 0.8,
      isFinal: true
    })
    expect(results[1]).toMatchObject({
      speaker: 'Speaker 2',
      content: 'General Kenobi.',
      timestampStart: 1.0,
      timestampEnd: 1.9,
      isFinal: true
    })
  })

  it('keeps the base label on interim results even when diarizing', async () => {
    const { connection, results } = await startService({ deepgramDiarize: true })
    connection.emit(LiveTranscriptionEvents.Transcript, { ...diarizedFinal, is_final: false })
    expect(results).toHaveLength(1)
    expect(results[0].speaker).toBe('Meeting Users')
    expect(results[0].isFinal).toBe(false)
  })

  it('uses the base label when diarization is off', async () => {
    const { connection, results } = await startService({})
    connection.emit(LiveTranscriptionEvents.Transcript, diarizedFinal)
    expect(results).toHaveLength(1)
    expect(results[0].speaker).toBe('Meeting Users')
  })
})
