import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/mint-test' }
}))

import { vi } from 'vitest'

import { LocalStorageService } from '../src/main/services/local-storage'

describe('reconcileInterruptedMeetings', () => {
  it('marks stuck "recording" meetings completed and leaves others alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-reconcile-'))
    const storage = new LocalStorageService(dir)
    const stuckId = await storage.createMeeting('Crashed meeting') // status: recording
    const doneId = await storage.createMeeting('Finished meeting')
    await storage.updateMeetingStatus(doneId, 'completed', new Date().toISOString())

    const repaired = await storage.reconcileInterruptedMeetings()

    expect(repaired).toBe(1)
    expect((await storage.getMeeting(stuckId)).status).toBe('completed')
    expect((await storage.getMeeting(stuckId)).endedAt).not.toBe(null)
  })
})
