import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

import { parseHelperLine, AppleSpeechService } from '../src/main/services/apple-speech'

function makeFakeChild(): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: { write: () => boolean; end: () => void }
  kill: () => void
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: { write: () => boolean; end: () => void }
    kill: () => void
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = { write: () => true, end: () => {} }
  child.kill = () => {}
  return child
}

describe('parseHelperLine', () => {
  it('parses a result line', () => {
    const line = '{"type":"result","text":"Hello world.","isFinal":true,"startMs":0,"endMs":1200}'
    expect(parseHelperLine(line)).toEqual({
      type: 'result',
      text: 'Hello world.',
      isFinal: true,
      startMs: 0,
      endMs: 1200
    })
  })

  it('parses status lines and rejects garbage', () => {
    expect(parseHelperLine('{"type":"ready"}')).toEqual({ type: 'ready' })
    expect(parseHelperLine('not json')).toBe(null)
    expect(parseHelperLine('{"type":"result"}')).toBe(null) // missing fields
    expect(parseHelperLine('{"type":"unknown"}')).toBe(null)
  })
})

describe('AppleSpeechService.startStreaming', () => {
  it('rejects promptly when the helper exits before becoming ready', async () => {
    const fakeChild = makeFakeChild()
    const spawnFn = vi.fn(() => fakeChild)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new AppleSpeechService({ spawnFn: spawnFn as any })

    const startPromise = service.startStreaming({}, 'Me', () => {})

    // Helper process crashes (e.g. missing dylib) before ever emitting "ready".
    fakeChild.emit('exit', 1, null)

    await expect(startPromise).rejects.toThrow(/exited with code 1 before becoming ready/)
  })
})
