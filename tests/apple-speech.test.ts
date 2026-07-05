import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

import { parseHelperLine } from '../src/main/services/apple-speech'

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
