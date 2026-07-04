import { AudioTee } from 'audiotee'
import { app } from 'electron'
import { join } from 'path'

/**
 * An instance is considered to have run "healthily" once it survives this
 * long, which forgives any earlier consecutive failures. AudioTee restarts
 * after every death as long as the previous instance was healthy; if
 * MAX_CONSECUTIVE_RESTARTS quick deaths happen in a row, capture gives up
 * and reports terminal instead of looping forever on a failing binary.
 */
const RESTART_HEALTHY_THRESHOLD_MS = 5000
const MAX_CONSECUTIVE_RESTARTS = 3

export type AudioTeeDegradationKind =
  | { kind: 'reconnecting' }
  | { kind: 'recovered' }
  | { kind: 'terminal'; reason: string }

export interface AudioTeeLike {
  on(event: 'data' | 'error' | 'stop', callback: (arg?: unknown) => void): void
  start(): Promise<void>
  stop(): void
}

export class AudioTeeService {
  private audioTee: AudioTeeLike | null = null
  private onChunk: ((chunk: Buffer) => void) | null = null
  private isStopped = true
  private consecutiveRestarts = 0
  private lastStartedAt = 0
  private degradedListeners: Array<(event: AudioTeeDegradationKind) => void> = []
  private readonly createInstance: () => AudioTeeLike

  constructor(options: { createInstance?: () => AudioTeeLike } = {}) {
    this.createInstance =
      options.createInstance ??
      (() => {
        const binaryPath = app.isPackaged ? join(process.resourcesPath, 'audiotee') : undefined
        return new AudioTee({ sampleRate: 16000, binaryPath }) as unknown as AudioTeeLike
      })
  }

  onDegraded(callback: (event: AudioTeeDegradationKind) => void): () => void {
    this.degradedListeners.push(callback)
    return () => {
      this.degradedListeners = this.degradedListeners.filter((l) => l !== callback)
    }
  }

  private emitDegraded(event: AudioTeeDegradationKind): void {
    for (const listener of this.degradedListeners) {
      try {
        listener(event)
      } catch (listenerError) {
        console.error('[MINT] AudioTee degraded listener threw:', listenerError)
      }
    }
  }

  async start(onChunk: (chunk: Buffer) => void): Promise<void> {
    this.onChunk = onChunk
    this.isStopped = false
    this.consecutiveRestarts = 0
    await this.spawnInstance()
  }

  private async spawnInstance(): Promise<void> {
    const instance = this.createInstance()

    instance.on('data', (chunk) => {
      this.onChunk?.((chunk as { data: Buffer }).data)
    })

    instance.on('error', (error) => {
      console.error('[MINT] AudioTee error:', error)
      this.handleDeath(`error: ${error instanceof Error ? error.message : String(error)}`)
    })

    instance.on('stop', () => {
      this.handleDeath('process exited')
    })

    this.audioTee = instance
    this.lastStartedAt = Date.now()
    await instance.start()
  }

  private handleDeath(reason: string): void {
    if (this.isStopped) return
    // Re-entry guard: we may receive both 'error' and 'stop' for the same
    // death. The first call clears `audioTee`; subsequent calls bail.
    if (this.audioTee === null) return
    this.audioTee = null

    const livedMs = Date.now() - this.lastStartedAt

    if (livedMs >= RESTART_HEALTHY_THRESHOLD_MS) {
      // The instance ran healthily before dying — forgive earlier failures.
      this.consecutiveRestarts = 0
    }

    if (this.consecutiveRestarts >= MAX_CONSECUTIVE_RESTARTS) {
      this.emitDegraded({
        kind: 'terminal',
        reason: `system audio capture died repeatedly (${reason})`
      })
      return
    }

    this.consecutiveRestarts++
    this.emitDegraded({ kind: 'reconnecting' })

    void this.spawnInstance()
      .then(() => {
        if (!this.isStopped) {
          this.emitDegraded({ kind: 'recovered' })
        }
      })
      .catch((restartError) => {
        console.error('[MINT] AudioTee restart failed:', restartError)
        this.audioTee = null
        this.emitDegraded({
          kind: 'terminal',
          reason: `restart failed: ${
            restartError instanceof Error ? restartError.message : String(restartError)
          }`
        })
      })
  }

  stop(): void {
    this.isStopped = true
    if (this.audioTee) {
      try {
        this.audioTee.stop()
      } catch (stopError) {
        console.error('[MINT] AudioTee stop failed:', stopError)
      }
      this.audioTee = null
    }
    this.onChunk = null
    this.degradedListeners = []
    console.log('[MINT] AudioTee system audio capture stopped')
  }
}
