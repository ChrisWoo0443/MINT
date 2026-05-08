import { AudioTee } from 'audiotee'
import { app } from 'electron'
import { join } from 'path'

/**
 * If a restart attempt dies again within this window, treat the restart as
 * having failed and stop retrying. Prevents tight restart loops on a
 * deterministically-failing binary.
 */
const RESTART_HEALTHY_THRESHOLD_MS = 5000

export type AudioTeeDegradationKind =
  | { kind: 'reconnecting' }
  | { kind: 'recovered' }
  | { kind: 'terminal'; reason: string }

export class AudioTeeService {
  private audioTee: AudioTee | null = null
  private onChunk: ((chunk: Buffer) => void) | null = null
  private isStopped = true
  private hasRestarted = false
  private lastStartedAt = 0
  private degradedListeners: Array<(event: AudioTeeDegradationKind) => void> = []

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
    this.hasRestarted = false
    await this.spawnInstance()
  }

  private async spawnInstance(): Promise<void> {
    const binaryPath = app.isPackaged ? join(process.resourcesPath, 'audiotee') : undefined

    const instance = new AudioTee({
      sampleRate: 16000,
      binaryPath
    })

    instance.on('data', (chunk) => {
      this.onChunk?.(chunk.data)
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

    if (this.hasRestarted) {
      // Already used our one restart — bail.
      this.emitDegraded({
        kind: 'terminal',
        reason: `system audio capture died (${reason})`
      })
      return
    }

    if (livedMs < RESTART_HEALTHY_THRESHOLD_MS && this.lastStartedAt !== 0 && livedMs >= 0) {
      // First instance died very quickly; still try one restart but if that
      // also fails we'll stop. (hasRestarted gate above handles the second
      // failure.)
    }

    this.hasRestarted = true
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
