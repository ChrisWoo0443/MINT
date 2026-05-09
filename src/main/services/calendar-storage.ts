import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import type {
  CalendarEvent,
  EventsFile,
  CreateCalendarEventArgs,
  UpdateCalendarEventPatch
} from '../../shared/api-types'

const FILENAME = 'events.json'
const CURRENT_VERSION = 1

export class CalendarStorageService {
  private storagePath: string

  constructor(storagePath: string) {
    this.storagePath = storagePath
  }

  setStoragePath(newPath: string): void {
    this.storagePath = newPath
  }

  async listEvents(rangeStartISO: string, rangeEndISO: string): Promise<CalendarEvent[]> {
    const file = await this.readFile()
    const startMs = Date.parse(rangeStartISO)
    const endMs = Date.parse(rangeEndISO)

    return file.events
      .filter((event) => {
        const eventStartMs = Date.parse(event.startISO)
        return eventStartMs >= startMs && eventStartMs < endMs
      })
      .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO))
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    const file = await this.readFile()
    return file.events.find((event) => event.id === id) ?? null
  }

  async createEvent(args: CreateCalendarEventArgs): Promise<CalendarEvent> {
    const file = await this.readFile()
    const now = new Date().toISOString()

    const event: CalendarEvent = {
      id: randomUUID(),
      title: args.title,
      startISO: args.startISO,
      endISO: args.endISO,
      notes: args.notes,
      tagId: args.tagId,
      createdAt: now,
      updatedAt: now
    }

    file.events.push(event)
    await this.writeFile(file)
    return event
  }

  async updateEvent(id: string, patch: UpdateCalendarEventPatch): Promise<CalendarEvent> {
    const file = await this.readFile()
    const index = file.events.findIndex((event) => event.id === id)
    if (index === -1) {
      throw new Error(`Event not found: ${id}`)
    }

    const previous = file.events[index]
    const updated: CalendarEvent = {
      ...previous,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.startISO !== undefined && { startISO: patch.startISO }),
      ...(patch.endISO !== undefined && { endISO: patch.endISO }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.tagId !== undefined && { tagId: patch.tagId }),
      updatedAt: new Date().toISOString()
    }
    file.events[index] = updated

    await this.writeFile(file)
    return updated
  }

  async deleteEvent(id: string): Promise<void> {
    const file = await this.readFile()
    const next = file.events.filter((event) => event.id !== id)
    if (next.length === file.events.length) return
    file.events = next
    await this.writeFile(file)
  }

  private async readFile(): Promise<EventsFile> {
    const path = join(this.storagePath, FILENAME)
    let raw: string
    try {
      raw = await readFile(path, 'utf-8')
    } catch {
      return { version: CURRENT_VERSION, events: [] }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn(`[calendar-storage] failed to parse ${path}, treating as empty`)
      return { version: CURRENT_VERSION, events: [] }
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version: unknown }).version !== CURRENT_VERSION ||
      !Array.isArray((parsed as { events: unknown }).events)
    ) {
      console.warn(`[calendar-storage] ${path} has unexpected shape, treating as empty`)
      return { version: CURRENT_VERSION, events: [] }
    }

    return parsed as EventsFile
  }

  private async writeFile(file: EventsFile): Promise<void> {
    await mkdir(this.storagePath, { recursive: true })
    const path = join(this.storagePath, FILENAME)
    await writeFile(path, JSON.stringify(file, null, 2), 'utf-8')
  }
}
