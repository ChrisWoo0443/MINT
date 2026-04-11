import { Whisper } from 'smart-whisper'

export interface WhisperEngineJob {
  pcmFloat32: Float32Array
  sampleRate: number
}

export interface WhisperWord {
  text: string
  startMs: number
  endMs: number
}

export interface WhisperEngineResult {
  words: WhisperWord[]
}

interface QueuedJob {
  job: WhisperEngineJob
  resolve: (result: WhisperEngineResult) => void
  reject: (error: unknown) => void
}

/**
 * WhisperEngine wraps the `smart-whisper` native binding and serializes
 * inference jobs through an internal queue so multiple callers (e.g. two
 * LocalWhisperService instances for mic + system audio) can share a single
 * loaded model without GPU contention.
 */
export class WhisperEngine {
  private whisper: Whisper | null = null
  private readonly queue: QueuedJob[] = []
  private processing = false
  private readonly modelPath: string

  constructor(modelPath: string) {
    this.modelPath = modelPath
  }

  /** Idempotently load the whisper model. */
  async load(): Promise<void> {
    if (this.whisper) return
    this.whisper = new Whisper(this.modelPath, { gpu: true })
    // Whisper's constructor is lazy — the native model is actually loaded
    // on first transcribe() call or when .load() is invoked explicitly.
    // Force it up front so the first inference isn't penalized.
    await this.whisper.load()
  }

  /** Queue a job and resolve with its segmented output. */
  submit(job: WhisperEngineJob): Promise<WhisperEngineResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject })
      void this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    const next = this.queue.shift()
    if (!next) return
    this.processing = true
    try {
      if (!this.whisper) throw new Error('WhisperEngine not loaded')
      // smart-whisper's default format is "simple", which yields segments
      // shaped like { from, to, text }. Timestamps are in milliseconds
      // relative to the start of the submitted PCM buffer (the native
      // binding multiplies whisper.cpp's 10ms-unit t0/t1 by 10).
      const task = await this.whisper.transcribe(next.job.pcmFloat32, {
        language: 'en',
        suppress_blank: true,
        no_timestamps: false
      })
      const segments = (await task.result) as Array<{
        text: string
        from: number
        to: number
      }>
      const words: WhisperWord[] = segments
        .filter((segment) => segment.text.trim().length > 0)
        .map((segment) => ({
          text: segment.text.trim(),
          startMs: segment.from,
          endMs: segment.to
        }))
      next.resolve({ words })
    } catch (error) {
      next.reject(error)
    } finally {
      this.processing = false
      if (this.queue.length > 0) void this.processNext()
    }
  }

  /** Free the native model handle and clear any pending queue. */
  async unload(): Promise<void> {
    if (this.whisper) {
      await this.whisper.free()
      this.whisper = null
    }
    this.queue.length = 0
  }
}
