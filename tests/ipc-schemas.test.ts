import { describe, it, expect } from 'vitest'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ShellPathSchema,
  ExternalUrlSchema,
  OllamaUrlSchema,
  WhisperModelSchema,
  RecordingStartArgsSchema,
  GenerateNotesArgsSchema,
  TagsArraySchema,
  SetMeetingTagsArgsSchema
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

describe('WhisperModelSchema', () => {
  it('accepts each known model name', () => {
    for (const name of ['tiny.en', 'base.en', 'small.en', 'medium.en']) {
      expect(WhisperModelSchema.parse(name)).toBe(name)
    }
  })

  it('rejects unknown model name', () => {
    expect(() => WhisperModelSchema.parse('gpt-4')).toThrow()
  })
})

describe('RecordingStartArgsSchema', () => {
  it('accepts minimal valid input', () => {
    const args = { title: 'Team sync', userName: 'Chris' }
    expect(RecordingStartArgsSchema.parse(args)).toMatchObject(args)
  })

  it('accepts full input with optional fields', () => {
    const args = {
      title: 'Team sync',
      userName: 'Chris',
      micDeviceId: 'abc',
      deepgramApiKey: 'k',
      openaiApiKey: 'k',
      notesProvider: 'ollama' as const,
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',
      transcriptionProvider: 'local' as const,
      whisperModel: 'small.en' as const
    }
    expect(RecordingStartArgsSchema.parse(args).ollamaUrl).toBe('http://localhost:11434')
  })

  it('rejects missing title', () => {
    expect(() => RecordingStartArgsSchema.parse({ userName: 'Chris' })).toThrow()
  })

  it('rejects unknown notesProvider', () => {
    expect(() =>
      RecordingStartArgsSchema.parse({ title: 't', userName: 'u', notesProvider: 'bogus' })
    ).toThrow()
  })

  it('rejects non-loopback ollamaUrl', () => {
    expect(() =>
      RecordingStartArgsSchema.parse({
        title: 't',
        userName: 'u',
        ollamaUrl: 'http://evil.example.com'
      })
    ).toThrow()
  })
})

describe('GenerateNotesArgsSchema', () => {
  it('accepts minimal input', () => {
    expect(GenerateNotesArgsSchema.parse({ meetingId: 'm1' }).meetingId).toBe('m1')
  })

  it('rejects empty meetingId', () => {
    expect(() => GenerateNotesArgsSchema.parse({ meetingId: '' })).toThrow()
  })
})

describe('TagsArraySchema', () => {
  it('accepts valid tag array', () => {
    const tags = [{ id: 't1', name: 'Urgent', color: '#ff0000' }]
    expect(TagsArraySchema.parse(tags)).toEqual(tags)
  })

  it('rejects missing color', () => {
    expect(() => TagsArraySchema.parse([{ id: 't1', name: 'Urgent' }])).toThrow()
  })

  it('rejects non-array input', () => {
    expect(() => TagsArraySchema.parse('not an array')).toThrow()
  })
})

describe('SetMeetingTagsArgsSchema', () => {
  it('accepts tuple of meetingId and tag ids', () => {
    const parsed = SetMeetingTagsArgsSchema.parse(['m1', ['t1', 't2']])
    expect(parsed).toEqual(['m1', ['t1', 't2']])
  })

  it('rejects when tag ids missing', () => {
    expect(() => SetMeetingTagsArgsSchema.parse(['m1'])).toThrow()
  })
})
