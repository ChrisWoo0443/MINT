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
})
