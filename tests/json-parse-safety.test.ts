import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/mint-test' }
}))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual }
})

import { LocalStorageService } from '../src/main/services/local-storage'
import * as fs from 'fs/promises'

describe('readMetadataFile resilience', () => {
  let service: LocalStorageService

  beforeEach(() => {
    service = new LocalStorageService('/tmp/mint-test')
  })

  it('throws descriptive error on corrupted metadata.json', async () => {
    vi.spyOn(fs, 'readFile').mockResolvedValue('not valid json {{{')

    await expect(service.getMeeting('test-meeting')).rejects.toThrow(/corrupted/i)
  })

  it('throws descriptive error on empty metadata.json', async () => {
    vi.spyOn(fs, 'readFile').mockResolvedValue('')

    await expect(service.getMeeting('test-meeting')).rejects.toThrow(/corrupted/i)
  })

  it('parses valid metadata.json normally', async () => {
    const validMetadata = JSON.stringify({
      id: 'test-123',
      title: 'Test Meeting',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: null
    })
    vi.spyOn(fs, 'readFile').mockResolvedValue(validMetadata)

    const result = await service.getMeeting('test-123')
    expect(result.title).toBe('Test Meeting')
  })
})

describe('OpenAI JSON parse resilience', () => {
  it('returns fallback notes when LLM returns non-JSON', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')

    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [{ message: { content: 'Here are the meeting notes in plain text...' } }]
    } as never)

    const result = await service.generateNotes('Some transcript')
    expect(result.notes.summary).toContain('meeting notes')
    expect(result.notes.decisions).toEqual([])
    expect(result.notes.actionItems).toEqual([])
  })

  it('parses valid JSON response normally', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')

    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    const validNotes = JSON.stringify({
      summary: 'Good meeting',
      decisions: ['Ship it'],
      actionItems: [{ task: 'Deploy', assignee: 'Chris' }]
    })

    vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [{ message: { content: validNotes } }]
    } as never)

    const result = await service.generateNotes('Some transcript')
    expect(result.notes.summary).toBe('Good meeting')
    expect(result.notes.decisions).toEqual(['Ship it'])
  })
})
