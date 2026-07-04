import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))
vi.mock('audiotee', () => ({ AudioTee: class {} }))

import { AudioTeeService, type AudioTeeLike } from '../src/main/services/audiotee'

class FakeAudioTee extends EventEmitter implements AudioTeeLike {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async start(): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  stop(): void {}
}

describe('AudioTeeService restart policy', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps restarting when instances die after a healthy run', async () => {
    const instances: FakeAudioTee[] = []
    const service = new AudioTeeService({
      createInstance: () => {
        const fake = new FakeAudioTee()
        instances.push(fake)
        return fake
      }
    })
    const events: string[] = []
    service.onDegraded((e) => events.push(e.kind))
    await service.start(() => {})

    for (let round = 0; round < 5; round++) {
      vi.advanceTimersByTime(10_000) // healthy lifetime
      instances[instances.length - 1].emit('stop')
      await Promise.resolve() // let the async respawn settle
      await Promise.resolve()
    }

    expect(instances.length).toBe(6) // original + 5 restarts
    expect(events.filter((k) => k === 'terminal')).toHaveLength(0)
  })

  it('goes terminal after 3 consecutive quick deaths', async () => {
    const instances: FakeAudioTee[] = []
    const service = new AudioTeeService({
      createInstance: () => {
        const fake = new FakeAudioTee()
        instances.push(fake)
        return fake
      }
    })
    const events: string[] = []
    service.onDegraded((e) => events.push(e.kind))
    await service.start(() => {})

    for (let round = 0; round < 4; round++) {
      vi.advanceTimersByTime(100) // dies immediately — unhealthy
      instances[instances.length - 1].emit('stop')
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(events).toContain('terminal')
    expect(instances.length).toBe(4) // original + 3 restart attempts, then stop
  })

  it('treats error followed by stop from the same death as one death', async () => {
    const instances: FakeAudioTee[] = []
    const service = new AudioTeeService({
      createInstance: () => {
        const fake = new FakeAudioTee()
        instances.push(fake)
        return fake
      }
    })
    const events: string[] = []
    service.onDegraded((e) => events.push(e.kind))
    await service.start(() => {})

    vi.advanceTimersByTime(10_000)
    instances[0].emit('error', new Error('boom'))
    instances[0].emit('stop') // duplicate signal from the same death
    await Promise.resolve()
    await Promise.resolve()

    expect(instances.length).toBe(2) // exactly one respawn, not two
    expect(events.filter((k) => k === 'reconnecting')).toHaveLength(1)
  })
})
