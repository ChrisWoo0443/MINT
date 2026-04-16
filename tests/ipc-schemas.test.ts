import { describe, it, expect } from 'vitest'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ShellPathSchema,
  ExternalUrlSchema,
  OllamaUrlSchema
} from '../src/main/ipc-schemas'

describe('MeetingIdSchema', () => {
  it('accepts non-empty string', () => {
    expect(MeetingIdSchema.parse('abc-123')).toBe('abc-123')
  })

  it('rejects empty string', () => {
    expect(() => MeetingIdSchema.parse('')).toThrow()
  })

  it('rejects non-string', () => {
    expect(() => MeetingIdSchema.parse(42)).toThrow()
    expect(() => MeetingIdSchema.parse(null)).toThrow()
    expect(() => MeetingIdSchema.parse(undefined)).toThrow()
  })

  it('rejects strings longer than 256 chars', () => {
    expect(() => MeetingIdSchema.parse('x'.repeat(257))).toThrow()
  })
})

describe('StoragePathSchema', () => {
  it('accepts absolute path', () => {
    expect(StoragePathSchema.parse('/Users/alice/MINT')).toBe('/Users/alice/MINT')
  })

  it('rejects empty string', () => {
    expect(() => StoragePathSchema.parse('')).toThrow()
  })

  it('rejects non-string', () => {
    expect(() => StoragePathSchema.parse(42)).toThrow()
  })
})

describe('ShellPathSchema', () => {
  it('accepts a path string', () => {
    expect(ShellPathSchema.parse('/Applications/Foo.app')).toBe('/Applications/Foo.app')
  })

  it('rejects empty string', () => {
    expect(() => ShellPathSchema.parse('')).toThrow()
  })
})

describe('ExternalUrlSchema', () => {
  it('accepts https url', () => {
    expect(ExternalUrlSchema.parse('https://example.com/x')).toBe('https://example.com/x')
  })

  it('accepts http url', () => {
    expect(ExternalUrlSchema.parse('http://example.com')).toBe('http://example.com')
  })

  it('rejects javascript: url', () => {
    expect(() => ExternalUrlSchema.parse('javascript:alert(1)')).toThrow()
  })

  it('rejects file: url', () => {
    expect(() => ExternalUrlSchema.parse('file:///etc/passwd')).toThrow()
  })

  it('rejects malformed url', () => {
    expect(() => ExternalUrlSchema.parse('not a url')).toThrow()
    expect(() => ExternalUrlSchema.parse('')).toThrow()
  })
})

describe('OllamaUrlSchema', () => {
  it('accepts http localhost', () => {
    expect(OllamaUrlSchema.parse('http://localhost:11434')).toBe('http://localhost:11434')
  })

  it('accepts http 127.0.0.1', () => {
    expect(OllamaUrlSchema.parse('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
  })

  it('rejects non-loopback host', () => {
    expect(() => OllamaUrlSchema.parse('http://evil.example.com')).toThrow()
  })

  it('rejects javascript: url', () => {
    expect(() => OllamaUrlSchema.parse('javascript:alert(1)')).toThrow()
  })
})
