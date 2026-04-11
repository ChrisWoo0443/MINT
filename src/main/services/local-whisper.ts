import type {
  TranscriptionService,
  TranscriptionStartConfig,
  TranscriptResult
} from './transcription'
import type { WhisperEngine } from './whisper-engine'
import { reconcile, detectSilence, type ReconcileState } from './rolling-window'

const SAMPLE_RATE = 16000
const WINDOW_SLIDE_MS = 750
const MIN_WINDOW_MS = 1000
const MAX_WINDOW_MS = 15000
const SILENCE_THRESHOLD_RMS = 0.005
const SILENCE_MIN_DURATION_MS = 600

export class LocalWhisperService implements TranscriptionService {
  private readonly engine: WhisperEngine
  private speakerLabel = ''
  private onResult: ((result: TranscriptResult) => void) | null = null
  private audioBuffer: Int16Array = new Int16Array(0)
  private bufferStartMs = 0
  private committedAudioEndMs = 0
  private scheduler: NodeJS.Timeout | null = null
  private jobInFlight = false
  private reconcileState: ReconcileState = {
    committedText: '',
    committedAudioEndMs: 0,
    previousInterim: null,
    stabilityCounts: new Map()
  }

  constructor(engine: WhisperEngine) {
    this.engine = engine
  }

  async startStreaming(
    _config: TranscriptionStartConfig,
    speakerLabel: string,
    onResult: (result: TranscriptResult) => void
  ): Promise<void> {
    this.speakerLabel = speakerLabel
    this.onResult = onResult
    this.audioBuffer = new Int16Array(0)
    this.bufferStartMs = 0
    this.committedAudioEndMs = 0
    this.reconcileState = {
      committedText: '',
      committedAudioEndMs: 0,
      previousInterim: null,
      stabilityCounts: new Map()
    }
    this.scheduler = setInterval(() => {
      this.tick().catch((error) => console.error('[MINT] LocalWhisper tick error:', error))
    }, WINDOW_SLIDE_MS)
  }

  sendAudio(audioBuffer: Buffer): void {
    const incomingSamples = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      Math.floor(audioBuffer.byteLength / 2)
    )
    const merged = new Int16Array(this.audioBuffer.length + incomingSamples.length)
    merged.set(this.audioBuffer, 0)
    merged.set(incomingSamples, this.audioBuffer.length)
    this.audioBuffer = merged

    const maxSamples = 30 * SAMPLE_RATE
    if (this.audioBuffer.length > maxSamples) {
      const dropCount = this.audioBuffer.length - maxSamples
      this.audioBuffer = this.audioBuffer.slice(dropCount)
      this.bufferStartMs += (dropCount / SAMPLE_RATE) * 1000
    }
  }

  stopStreaming(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler)
      this.scheduler = null
    }
    this.onResult = null
    this.audioBuffer = new Int16Array(0)
    this.jobInFlight = false
  }

  private async tick(): Promise<void> {
    if (this.jobInFlight) return
    if (!this.onResult) return

    const committedOffsetSamples = Math.floor(
      ((this.committedAudioEndMs - this.bufferStartMs) / 1000) * SAMPLE_RATE
    )
    const activeSamples = this.audioBuffer.slice(Math.max(0, committedOffsetSamples))
    const activeDurationMs = (activeSamples.length / SAMPLE_RATE) * 1000
    if (activeDurationMs < MIN_WINDOW_MS) return

    const forceCommit = activeDurationMs >= MAX_WINDOW_MS
    this.jobInFlight = true

    try {
      const pcmFloat32 = int16ToFloat32(activeSamples)
      const result = await this.engine.submit({ pcmFloat32, sampleRate: SAMPLE_RATE })

      const baseOffsetMs = this.committedAudioEndMs
      const windowWords = result.words.map((word) => ({
        text: word.text,
        endMs: baseOffsetMs + word.endMs
      }))

      const reconciled = reconcile(this.reconcileState, windowWords)
      this.reconcileState = reconciled.newState

      for (const emission of reconciled.finalEmissions) {
        this.emit({
          text: emission.text,
          isFinal: true,
          startMs: this.committedAudioEndMs,
          endMs: emission.endMs
        })
        this.committedAudioEndMs = emission.endMs
      }

      if (reconciled.interim) {
        this.emit({
          text: reconciled.interim.text,
          isFinal: false,
          startMs: this.committedAudioEndMs,
          endMs: reconciled.interim.endMs
        })
      }

      const silenceHit = detectSilence(activeSamples, {
        thresholdRms: SILENCE_THRESHOLD_RMS,
        minDurationMs: SILENCE_MIN_DURATION_MS
      })

      if (silenceHit || forceCommit) {
        if (reconciled.interim) {
          this.emit({
            text: reconciled.interim.text,
            isFinal: true,
            startMs: this.committedAudioEndMs,
            endMs: reconciled.interim.endMs
          })
          this.committedAudioEndMs = reconciled.interim.endMs
        }
        this.reconcileState = {
          committedText: this.reconcileState.committedText,
          committedAudioEndMs: this.committedAudioEndMs,
          previousInterim: null,
          stabilityCounts: new Map()
        }
      }
    } finally {
      this.jobInFlight = false
    }
  }

  private emit(options: {
    text: string
    isFinal: boolean
    startMs: number
    endMs: number
  }): void {
    if (!this.onResult) return
    this.onResult({
      speaker: this.speakerLabel,
      content: options.text,
      timestampStart: options.startMs / 1000,
      timestampEnd: options.endMs / 1000,
      isFinal: options.isFinal
    })
  }
}

function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] / 32768
  }
  return output
}
