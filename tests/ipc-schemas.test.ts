import { describe, it, expect } from 'vitest'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ShellPathSchema
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
