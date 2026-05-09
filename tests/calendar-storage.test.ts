import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { CalendarStorageService } from '../src/main/services/calendar-storage'

let tmpRoot: string
let service: CalendarStorageService

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'mint-cal-'))
  service = new CalendarStorageService(tmpRoot)
})

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

describe('CalendarStorageService.createEvent', () => {
  it('creates an event and returns it with id and timestamps', async () => {
    const event = await service.createEvent({
      title: 'Standup',
      startISO: '2026-05-08T10:00:00-07:00',
      endISO: '2026-05-08T10:30:00-07:00'
    })

    expect(event.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(event.title).toBe('Standup')
    expect(event.createdAt).toBeTruthy()
    expect(event.updatedAt).toBe(event.createdAt)
  })

  it('persists the event to events.json', async () => {
    await service.createEvent({
      title: 'Standup',
      startISO: '2026-05-08T10:00:00-07:00',
      endISO: '2026-05-08T10:30:00-07:00'
    })

    const raw = await readFile(join(tmpRoot, 'events.json'), 'utf-8')
    const data = JSON.parse(raw)
    expect(data.version).toBe(1)
    expect(data.events).toHaveLength(1)
    expect(data.events[0].title).toBe('Standup')
  })
})

describe('CalendarStorageService.listEvents', () => {
  it('returns events whose startISO falls within [rangeStart, rangeEnd)', async () => {
    await service.createEvent({
      title: 'Before',
      startISO: '2026-05-02T10:00:00-07:00',
      endISO: '2026-05-02T11:00:00-07:00'
    })
    const inside = await service.createEvent({
      title: 'Inside',
      startISO: '2026-05-05T10:00:00-07:00',
      endISO: '2026-05-05T11:00:00-07:00'
    })
    await service.createEvent({
      title: 'After',
      startISO: '2026-05-10T10:00:00-07:00',
      endISO: '2026-05-10T11:00:00-07:00'
    })

    const events = await service.listEvents(
      '2026-05-03T00:00:00-07:00',
      '2026-05-10T00:00:00-07:00'
    )
    expect(events.map((e) => e.id)).toEqual([inside.id])
  })

  it('returns events sorted by startISO ascending', async () => {
    const later = await service.createEvent({
      title: 'Later',
      startISO: '2026-05-08T14:00:00-07:00',
      endISO: '2026-05-08T15:00:00-07:00'
    })
    const earlier = await service.createEvent({
      title: 'Earlier',
      startISO: '2026-05-08T09:00:00-07:00',
      endISO: '2026-05-08T10:00:00-07:00'
    })

    const events = await service.listEvents(
      '2026-05-08T00:00:00-07:00',
      '2026-05-09T00:00:00-07:00'
    )
    expect(events.map((e) => e.id)).toEqual([earlier.id, later.id])
  })

  it('returns empty array when events.json does not exist', async () => {
    const events = await service.listEvents(
      '2026-05-01T00:00:00-07:00',
      '2026-05-15T00:00:00-07:00'
    )
    expect(events).toEqual([])
  })
})

describe('CalendarStorageService.getEvent', () => {
  it('returns the event by id', async () => {
    const created = await service.createEvent({
      title: 'Standup',
      startISO: '2026-05-08T10:00:00-07:00',
      endISO: '2026-05-08T10:30:00-07:00'
    })

    const found = await service.getEvent(created.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Standup')
  })

  it('returns null for unknown id', async () => {
    const found = await service.getEvent('does-not-exist')
    expect(found).toBeNull()
  })
})

describe('CalendarStorageService.updateEvent', () => {
  it('updates only the fields in the patch and refreshes updatedAt', async () => {
    const created = await service.createEvent({
      title: 'Standup',
      startISO: '2026-05-08T10:00:00-07:00',
      endISO: '2026-05-08T10:30:00-07:00'
    })

    await new Promise((resolve) => setTimeout(resolve, 5))
    const updated = await service.updateEvent(created.id, { title: 'Sprint planning' })

    expect(updated.title).toBe('Sprint planning')
    expect(updated.startISO).toBe(created.startISO)
    expect(updated.endISO).toBe(created.endISO)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt > created.updatedAt).toBe(true)
  })

  it('throws if id is unknown', async () => {
    await expect(
      service.updateEvent('does-not-exist', { title: 'x' })
    ).rejects.toThrow()
  })
})

describe('CalendarStorageService.deleteEvent', () => {
  it('removes the event', async () => {
    const created = await service.createEvent({
      title: 'Standup',
      startISO: '2026-05-08T10:00:00-07:00',
      endISO: '2026-05-08T10:30:00-07:00'
    })

    await service.deleteEvent(created.id)
    const found = await service.getEvent(created.id)
    expect(found).toBeNull()
  })

  it('is idempotent for unknown id', async () => {
    await expect(service.deleteEvent('does-not-exist')).resolves.not.toThrow()
  })
})

describe('CalendarStorageService corruption handling', () => {
  it('treats corrupt events.json as empty without overwriting it', async () => {
    const path = join(tmpRoot, 'events.json')
    await writeFile(path, '{ this is not json', 'utf-8')

    const events = await service.listEvents(
      '2026-05-01T00:00:00-07:00',
      '2026-05-15T00:00:00-07:00'
    )
    expect(events).toEqual([])

    const raw = await readFile(path, 'utf-8')
    expect(raw).toBe('{ this is not json')
  })

  it('treats unknown version as empty without overwriting', async () => {
    const path = join(tmpRoot, 'events.json')
    await writeFile(
      path,
      JSON.stringify({ version: 99, events: [{ pretend: 'event' }] }),
      'utf-8'
    )

    const events = await service.listEvents(
      '2026-05-01T00:00:00-07:00',
      '2026-05-15T00:00:00-07:00'
    )
    expect(events).toEqual([])

    const raw = await readFile(path, 'utf-8')
    expect(raw).toContain('"version":99')
  })
})
