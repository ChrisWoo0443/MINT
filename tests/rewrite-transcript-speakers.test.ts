import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/mint-test' }
}))

import { vi } from 'vitest'

import { LocalStorageService } from '../src/main/services/local-storage'

describe('rewriteTranscriptSpeakers', () => {
  it('rewrites speaker labels while preserving content and timestamps', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-rewrite-'))
    const storage = new LocalStorageService(dir)
    const meetingId = await storage.createMeeting('Sync')
    await storage.insertTranscriptChunk(meetingId, 'Chris', 'hello', 1, 2)
    await storage.insertTranscriptChunk(meetingId, 'Meeting Users', 'hi there', 3, 4)

    const entries = await storage.getTranscripts(meetingId)
    const relabeled = entries.map((entry) =>
      entry.speaker === 'Meeting Users' ? { ...entry, speaker: 'Speaker 1' } : entry
    )
    await storage.rewriteTranscriptSpeakers(meetingId, relabeled)

    const result = await storage.getTranscripts(meetingId)
    expect(result[0].speaker).toBe('Chris')
    expect(result[1].speaker).toBe('Speaker 1')
    expect(result[1].content).toBe('hi there')
  })

  it('preserves entries at and beyond 100 minutes through a round trip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-rewrite-long-'))
    const storage = new LocalStorageService(dir)
    const meetingId = await storage.createMeeting('Long Sync')
    await storage.insertTranscriptChunk(meetingId, 'Chris', 'early', 61, 62)
    await storage.insertTranscriptChunk(meetingId, 'Meeting Users', 'late', 6000.5, 6001)

    const entries = await storage.getTranscripts(meetingId)
    await storage.rewriteTranscriptSpeakers(meetingId, entries)

    const result = await storage.getTranscripts(meetingId)
    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('Chris')
    expect(result[0].content).toBe('early')
    expect(result[1].speaker).toBe('Meeting Users')
    expect(result[1].content).toBe('late')
    expect(result[1].timestampStart).toBe(6000)
  })
})
