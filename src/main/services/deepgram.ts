import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent
} from '@deepgram/sdk'
import type {
  TranscriptionService,
  TranscriptionStartConfig,
  TranscriptResult,
  TranscriptionDegradationKind
} from './transcription'

export type { TranscriptResult } from './transcription'

// 16 kHz × 2 bytes (linear16 mono) × 30 s = 960,000 bytes.
const MAX_BUFFERED_AUDIO_BYTES = 16000 * 2 * 30

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000, 5000] as const
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length

type State = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'stopped' | 'terminal'

export interface DeepgramConnectionLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off?(event: string, listener: (...args: unknown[]) => void): unknown
  send(payload: ArrayBuffer | Buffer): unknown
  finish(): unknown
}

export interface DeepgramServiceOptions {
  /**
   * Override the underlying connection factory (used by tests).
   */
  connectionFactory?: (apiKey: string) => DeepgramConnectionLike
  /**
   * Override timer functions (used by tests so reconnect logic doesn't depend
   * on real wall-clock time).
   */
  setTimeout?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void
}

function defaultConnectionFactory(apiKey: string): DeepgramConnectionLike {
  const deepgram = createClient(apiKey)
  return deepgram.listen.live({
    model: 'nova-2',
    language: 'en',
    smart_format: true,
    punctuate: true,
    diarize: false,
    interim_results: true,
    encoding: 'linear16',
    sample_rate: 16000
  }) as unknown as DeepgramConnectionLike
}

export class DeepgramService implements TranscriptionService {
  private connection: DeepgramConnectionLike | null = null
  private onResult: ((result: TranscriptResult) => void) | null = null
  private degradedListeners: Array<(event: TranscriptionDegradationKind) => void> = []
  private state: State = 'idle'
  private apiKey = ''
  private speakerLabel = ''
  private pendingChunks: Buffer[] = []
  private pendingBytes = 0
  private droppedBytesSinceLastReport = 0
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private readonly connectionFactory: (apiKey: string) => DeepgramConnectionLike
  private readonly setTimeoutFn: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void

  constructor(options: DeepgramServiceOptions = {}) {
    this.connectionFactory = options.connectionFactory ?? defaultConnectionFactory
    this.setTimeoutFn = options.setTimeout ?? ((handler, ms) => setTimeout(handler, ms))
    this.clearTimeoutFn = options.clearTimeout ?? ((handle) => clearTimeout(handle))
  }

  onDegraded(callback: (event: TranscriptionDegradationKind) => void): () => void {
    this.degradedListeners.push(callback)
    return () => {
      this.degradedListeners = this.degradedListeners.filter((l) => l !== callback)
    }
  }

  private emitDegraded(event: TranscriptionDegradationKind): void {
    for (const listener of this.degradedListeners) {
      try {
        listener(event)
      } catch (listenerError) {
        console.error('[MINT] degraded listener threw:', listenerError)
      }
    }
  }

  async startStreaming(
    config: TranscriptionStartConfig,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void> {
    const apiKey = config.deepgramApiKey
    if (!apiKey) {
      throw new Error('Deepgram API key is required')
    }
    this.apiKey = apiKey
    this.speakerLabel = speakerLabel
    this.onResult = onResult
    this.state = 'connecting'
    this.reconnectAttempt = 0

    await this.openConnection(/* initial */ true)
  }

  /**
   * Open a fresh Deepgram connection. On the initial call this rejects if the
   * connection fails to open (so callers know start failed). On reconnect
   * calls the promise resolves either way; failure is signalled via the
   * reconnect loop.
   */
  private openConnection(initial: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let connection: DeepgramConnectionLike
      try {
        connection = this.connectionFactory(this.apiKey)
      } catch (factoryError) {
        if (initial) {
          reject(factoryError)
        } else {
          this.scheduleReconnect()
          resolve()
        }
        return
      }

      this.connection = connection

      let settled = false
      const onOpenError = (error: unknown): void => {
        if (settled) return
        settled = true
        connection.off?.(LiveTranscriptionEvents.Error, onOpenError as never)
        if (initial) {
          this.state = 'idle'
          reject(error)
        } else {
          // Reconnect attempt failed — go back to backoff loop.
          this.connection = null
          this.scheduleReconnect()
          resolve()
        }
      }

      connection.on(LiveTranscriptionEvents.Error, onOpenError as never)

      connection.on(LiveTranscriptionEvents.Open, () => {
        if (settled) return
        settled = true
        // Detach the open-promise error listener so future transient errors
        // don't reject an already-resolved promise.
        connection.off?.(LiveTranscriptionEvents.Error, onOpenError as never)

        const wasReconnecting = this.state === 'reconnecting'
        this.state = 'open'
        this.reconnectAttempt = 0

        // Persistent listeners.
        connection.on(LiveTranscriptionEvents.Transcript, ((data: LiveTranscriptionEvent) => {
          this.handleTranscript(data)
        }) as never)
        connection.on(LiveTranscriptionEvents.Error, ((error: unknown) => {
          console.error('[MINT] Deepgram runtime error:', error)
        }) as never)
        connection.on(LiveTranscriptionEvents.Close, (() => {
          this.handleClose()
        }) as never)

        if (wasReconnecting) {
          this.flushPendingChunks()
          this.emitDegraded({ kind: 'recovered' })
        }
        resolve()
      })
    })
  }

  private handleTranscript(data: LiveTranscriptionEvent): void {
    const alternative = data.channel?.alternatives?.[0]
    if (!alternative || !alternative.transcript) return

    const words = alternative.words || []
    const startTime = words.length > 0 ? words[0].start : 0
    const endTime = words.length > 0 ? words[words.length - 1].end : 0

    const result: TranscriptResult = {
      speaker: this.speakerLabel,
      content: alternative.transcript,
      timestampStart: startTime,
      timestampEnd: endTime,
      isFinal: data.is_final ?? false
    }
    this.onResult?.(result)
  }

  private handleClose(): void {
    if (this.state === 'stopped' || this.state === 'terminal') {
      // User-initiated finish or post-terminal — nothing to do.
      return
    }
    // Unexpected drop. Move to reconnecting and start backoff.
    this.connection = null
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.state === 'stopped' || this.state === 'terminal') return

    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.state = 'terminal'
      this.connection = null
      this.emitDegraded({
        kind: 'terminal',
        reason: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`
      })
      return
    }

    this.state = 'reconnecting'
    const delayMs = RECONNECT_BACKOFF_MS[this.reconnectAttempt]
    const attempt = this.reconnectAttempt + 1
    this.reconnectAttempt = attempt

    this.emitDegraded({ kind: 'reconnecting', attempt, nextDelayMs: delayMs })

    if (this.reconnectTimer !== null) {
      this.clearTimeoutFn(this.reconnectTimer)
    }
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null
      if (this.state !== 'reconnecting') return
      void this.openConnection(false)
    }, delayMs)
  }

  private flushPendingChunks(): void {
    const chunks = this.pendingChunks
    this.pendingChunks = []
    this.pendingBytes = 0
    this.droppedBytesSinceLastReport = 0
    for (const chunk of chunks) {
      this.sendToConnection(chunk)
    }
  }

  private sendToConnection(buffer: Buffer): void {
    if (!this.connection) return
    try {
      // Buffer-backed slice may yield SharedArrayBuffer in some lib targets;
      // copy into a fresh ArrayBuffer for a stable type.
      const copy = new ArrayBuffer(buffer.byteLength)
      new Uint8Array(copy).set(buffer)
      this.connection.send(copy)
    } catch (sendError) {
      console.error('[MINT] Deepgram send failed:', sendError)
    }
  }

  sendAudio(audioBuffer: Buffer): void {
    if (this.state === 'stopped' || this.state === 'terminal') {
      // Reject cleanly: drop the chunk + log once. We don't throw because the
      // call sites are fire-and-forget IPC handlers; throwing would create
      // unhandled exceptions on every chunk after stop.
      return
    }

    if (this.state === 'open' && this.connection) {
      this.sendToConnection(audioBuffer)
      return
    }

    // connecting or reconnecting — buffer.
    this.pendingChunks.push(audioBuffer)
    this.pendingBytes += audioBuffer.byteLength

    while (this.pendingBytes > MAX_BUFFERED_AUDIO_BYTES && this.pendingChunks.length > 0) {
      const dropped = this.pendingChunks.shift()
      if (!dropped) break
      this.pendingBytes -= dropped.byteLength
      this.droppedBytesSinceLastReport += dropped.byteLength
    }

    if (this.droppedBytesSinceLastReport > 0) {
      const droppedBytes = this.droppedBytesSinceLastReport
      this.droppedBytesSinceLastReport = 0
      this.emitDegraded({
        kind: 'dropped',
        droppedBytes,
        reason: 'reconnect buffer overflow'
      })
    }
  }

  stopStreaming(): void {
    this.state = 'stopped'
    if (this.reconnectTimer !== null) {
      this.clearTimeoutFn(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.connection) {
      try {
        this.connection.finish()
      } catch (finishError) {
        console.error('[MINT] Deepgram finish failed:', finishError)
      }
      this.connection = null
    }
    this.pendingChunks = []
    this.pendingBytes = 0
    this.droppedBytesSinceLastReport = 0
    this.degradedListeners = []
    this.onResult = null
  }
}
