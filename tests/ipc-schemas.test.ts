import { describe, it, expect } from 'vitest'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ExternalUrlSchema,
  OllamaUrlSchema,
  WhisperModelSchema,
  RecordingStartArgsSchema,
  GenerateNotesArgsSchema,
  TagsArraySchema,
  SetMeetingTagsArgsSchema,
  CalendarEventSchema,
  CalendarListArgsSchema,
  CalendarGetArgsSchema,
  CalendarCreateArgsSchema,
  CalendarUpdateArgsSchema,
  CalendarDeleteArgsSchema,
  SecretNameSchema,
  SecretSetArgsSchema
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

describe('MeetingIdSchema path traversal', () => {
  it('rejects ids containing path separators or dot-dot', () => {
    expect(() => MeetingIdSchema.parse('../../etc')).toThrow()
    expect(() => MeetingIdSchema.parse('a/b')).toThrow()
    expect(() => MeetingIdSchema.parse('a\\b')).toThrow()
    expect(() => MeetingIdSchema.parse('a..b')).toThrow()
  })

  it('accepts real generated meeting ids', () => {
    expect(MeetingIdSchema.parse('2026-07-03T10-30-00_weekly-standup')).toBe(
      '2026-07-03T10-30-00_weekly-standup'
    )
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
      transcriptionProvider: 'local' as const,
      whisperModel: 'small.en' as const
    }
    const parsed = RecordingStartArgsSchema.parse(args)
    expect(parsed.micDeviceId).toBe('abc')
    expect(parsed.transcriptionProvider).toBe('local')
    expect(parsed.whisperModel).toBe('small.en')
  })

  it('rejects missing title', () => {
    expect(() => RecordingStartArgsSchema.parse({ userName: 'Chris' })).toThrow()
  })

  it('strips unknown notesProvider field', () => {
    const parsed = RecordingStartArgsSchema.parse({
      title: 't',
      userName: 'u',
      notesProvider: 'bogus'
    })
    expect(parsed).not.toHaveProperty('notesProvider')
  })

  it('strips unknown ollamaUrl field', () => {
    const parsed = RecordingStartArgsSchema.parse({
      title: 't',
      userName: 'u',
      ollamaUrl: 'http://evil.example.com'
    })
    expect(parsed).not.toHaveProperty('ollamaUrl')
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

describe('OllamaUrlSchema — regression: pre-hardening vulnerability', () => {
  const attackerUrls = [
    'http://evil.example.com',
    'https://169.254.169.254/latest/meta-data', // AWS IMDS
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://localhost.evil.com'
  ]

  for (const url of attackerUrls) {
    it(`rejects ${url}`, () => {
      expect(() => OllamaUrlSchema.parse(url)).toThrow()
    })
  }
})

describe('CalendarEventSchema', () => {
  const validEvent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Standup',
    startISO: '2026-05-08T10:00:00-07:00',
    endISO: '2026-05-08T10:30:00-07:00',
    createdAt: '2026-05-08T09:00:00-07:00',
    updatedAt: '2026-05-08T09:00:00-07:00'
  }

  it('accepts a minimal valid event', () => {
    expect(() => CalendarEventSchema.parse(validEvent)).not.toThrow()
  })

  it('accepts optional notes and tagId', () => {
    expect(() =>
      CalendarEventSchema.parse({ ...validEvent, notes: 'agenda', tagId: 'blue' })
    ).not.toThrow()
  })

  it('rejects endISO not strictly greater than startISO', () => {
    expect(() =>
      CalendarEventSchema.parse({ ...validEvent, endISO: validEvent.startISO })
    ).toThrow()
    expect(() =>
      CalendarEventSchema.parse({
        ...validEvent,
        endISO: '2026-05-08T09:00:00-07:00'
      })
    ).toThrow()
  })

  it('rejects unparseable date strings', () => {
    expect(() =>
      CalendarEventSchema.parse({ ...validEvent, startISO: 'tomorrow at noon' })
    ).toThrow()
  })

  it('rejects empty title', () => {
    expect(() => CalendarEventSchema.parse({ ...validEvent, title: '' })).toThrow()
  })

  it('rejects title longer than 200 chars', () => {
    expect(() =>
      CalendarEventSchema.parse({ ...validEvent, title: 'x'.repeat(201) })
    ).toThrow()
  })

  it('rejects notes longer than 2000 chars', () => {
    expect(() =>
      CalendarEventSchema.parse({ ...validEvent, notes: 'x'.repeat(2001) })
    ).toThrow()
  })
})

describe('CalendarListArgsSchema', () => {
  it('accepts a 7-day range', () => {
    expect(() =>
      CalendarListArgsSchema.parse({
        rangeStartISO: '2026-05-03T00:00:00-07:00',
        rangeEndISO: '2026-05-10T00:00:00-07:00'
      })
    ).not.toThrow()
  })

  it('rejects rangeEndISO <= rangeStartISO', () => {
    expect(() =>
      CalendarListArgsSchema.parse({
        rangeStartISO: '2026-05-10T00:00:00-07:00',
        rangeEndISO: '2026-05-03T00:00:00-07:00'
      })
    ).toThrow()
  })

  it('rejects ranges longer than 31 days', () => {
    expect(() =>
      CalendarListArgsSchema.parse({
        rangeStartISO: '2026-05-01T00:00:00-07:00',
        rangeEndISO: '2026-06-02T00:00:00-07:00'
      })
    ).toThrow()
  })
})

describe('CalendarCreateArgsSchema', () => {
  it('accepts a minimal create payload', () => {
    expect(() =>
      CalendarCreateArgsSchema.parse({
        title: 'Standup',
        startISO: '2026-05-08T10:00:00-07:00',
        endISO: '2026-05-08T10:30:00-07:00'
      })
    ).not.toThrow()
  })

  it('rejects when endISO <= startISO', () => {
    expect(() =>
      CalendarCreateArgsSchema.parse({
        title: 'Standup',
        startISO: '2026-05-08T10:30:00-07:00',
        endISO: '2026-05-08T10:30:00-07:00'
      })
    ).toThrow()
  })
})

describe('CalendarUpdateArgsSchema', () => {
  const validId = '11111111-1111-4111-8111-111111111111'

  it('accepts a partial patch', () => {
    expect(() =>
      CalendarUpdateArgsSchema.parse({ id: validId, patch: { title: 'Renamed' } })
    ).not.toThrow()
  })

  it('rejects an empty patch', () => {
    expect(() =>
      CalendarUpdateArgsSchema.parse({ id: validId, patch: {} })
    ).toThrow()
  })

  it('when both startISO and endISO are present in patch, endISO must be > startISO', () => {
    expect(() =>
      CalendarUpdateArgsSchema.parse({
        id: validId,
        patch: {
          startISO: '2026-05-08T10:00:00-07:00',
          endISO: '2026-05-08T10:00:00-07:00'
        }
      })
    ).toThrow()
  })
})

describe('CalendarGetArgsSchema and CalendarDeleteArgsSchema', () => {
  it('accept a UUID-shaped id', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(() => CalendarGetArgsSchema.parse({ id })).not.toThrow()
    expect(() => CalendarDeleteArgsSchema.parse({ id })).not.toThrow()
  })

  it('reject empty id', () => {
    expect(() => CalendarGetArgsSchema.parse({ id: '' })).toThrow()
    expect(() => CalendarDeleteArgsSchema.parse({ id: '' })).toThrow()
  })

  it('reject non-UUID id', () => {
    expect(() => CalendarGetArgsSchema.parse({ id: 'not-a-uuid' })).toThrow()
    expect(() => CalendarDeleteArgsSchema.parse({ id: 'not-a-uuid' })).toThrow()
  })
})

describe('secrets schemas', () => {
  it('accepts known secret names only', () => {
    expect(SecretNameSchema.parse('deepgramApiKey')).toBe('deepgramApiKey')
    expect(SecretNameSchema.parse('openaiApiKey')).toBe('openaiApiKey')
    expect(() => SecretNameSchema.parse('path')).toThrow()
  })

  it('allows empty string value (clears the secret) but caps length', () => {
    expect(SecretSetArgsSchema.parse(['deepgramApiKey', ''])).toEqual(['deepgramApiKey', ''])
    expect(() => SecretSetArgsSchema.parse(['deepgramApiKey', 'x'.repeat(513)])).toThrow()
  })

  it('rejects deepgramApiKey inside recording:start args', () => {
    const parsed = RecordingStartArgsSchema.parse({
      title: 'Standup',
      userName: 'Chris',
      deepgramApiKey: 'should-be-stripped'
    })
    expect('deepgramApiKey' in parsed).toBe(false)
  })
})
