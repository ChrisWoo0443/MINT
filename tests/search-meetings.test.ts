import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import * as os from 'os'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/mint-test' }
}))

import { vi } from 'vitest'

let testDir: string

async function createFixtureMeeting(
  baseDir: string,
  id: string,
  title: string,
  transcriptContent: string,
  notesContent: string | null
): Promise<void> {
  const meetingDir = join(baseDir, id)
  await mkdir(meetingDir, { recursive: true })

  const metadata = {
    id,
    title,
    status: 'completed',
    startedAt: '2026-05-03T10:00:00Z',
    endedAt: '2026-05-03T10:30:00Z'
  }
  await writeFile(join(meetingDir, 'metadata.json'), JSON.stringify(metadata), 'utf-8')
  await writeFile(join(meetingDir, 'transcript.md'), transcriptContent, 'utf-8')

  if (notesContent !== null) {
    await writeFile(join(meetingDir, 'notes.md'), notesContent, 'utf-8')
  }
}

beforeEach(async () => {
  testDir = join(os.tmpdir(), `mint-search-test-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('searchMeetings', () => {
  it('returns empty array for empty query', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(testDir, 'mtg-1', 'Q2 Planning', '# Transcript\n\n[00:01] Alice: Hello', null)

    expect(await service.searchMeetings('')).toEqual([])
    expect(await service.searchMeetings('   ')).toEqual([])
  })

  it('matches by meeting title', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(testDir, 'mtg-1', 'Q2 Planning Session', '# Transcript\n', null)
    await createFixtureMeeting(testDir, 'mtg-2', 'Daily Standup', '# Transcript\n', null)

    const results = await service.searchMeetings('Q2')
    expect(results.map((m) => m.id)).toContain('mtg-1')
    expect(results.map((m) => m.id)).not.toContain('mtg-2')
  })

  it('matches by transcript content', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(
      testDir,
      'mtg-1',
      'Meeting A',
      '# Transcript\n\n[00:01] Alice: We should migrate to Postgres',
      null
    )
    await createFixtureMeeting(
      testDir,
      'mtg-2',
      'Meeting B',
      '# Transcript\n\n[00:01] Bob: Nothing special here',
      null
    )

    const results = await service.searchMeetings('Postgres')
    expect(results.map((m) => m.id)).toContain('mtg-1')
    expect(results.map((m) => m.id)).not.toContain('mtg-2')
  })

  it('matches by notes content', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    const notes = `# Notes — Meeting A\n\n## Summary\nWe decided to deploy on Friday.\n\n## Decisions\n- Deploy on Friday\n\n## Action Items\n- [ ] Prepare release notes — Alice`

    await createFixtureMeeting(testDir, 'mtg-1', 'Meeting A', '# Transcript\n', notes)
    await createFixtureMeeting(testDir, 'mtg-2', 'Meeting B', '# Transcript\n', null)

    const results = await service.searchMeetings('deploy on Friday')
    expect(results.map((m) => m.id)).toContain('mtg-1')
    expect(results.map((m) => m.id)).not.toContain('mtg-2')
  })

  it('is case-insensitive', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(
      testDir,
      'mtg-1',
      'Meeting A',
      '# Transcript\n\n[00:01] Alice: We need to update the ROADMAP',
      null
    )

    expect((await service.searchMeetings('roadmap')).map((m) => m.id)).toContain('mtg-1')
    expect((await service.searchMeetings('ROADMAP')).map((m) => m.id)).toContain('mtg-1')
    expect((await service.searchMeetings('RoadMap')).map((m) => m.id)).toContain('mtg-1')
  })

  it('returns no results when nothing matches', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(testDir, 'mtg-1', 'Team Sync', '# Transcript\n\n[00:01] Alice: Hello', null)

    const results = await service.searchMeetings('unicorn')
    expect(results).toEqual([])
  })

  it('does not fail if notes file is missing', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService(testDir)

    await createFixtureMeeting(testDir, 'mtg-1', 'Meeting without notes', '# Transcript\n\n[00:01] Alice: No notes yet', null)

    const results = await service.searchMeetings('No notes')
    expect(results.map((m) => m.id)).toContain('mtg-1')
  })
})
