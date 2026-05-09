import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent, TagDefinition } from '../../../shared/api-types'
import { EventModal } from './EventModal'

const HOUR_HEIGHT_PX = 48
const VISIBLE_START_HOUR = 8
const SCROLL_START_HOUR = 6
const SCROLL_END_HOUR = 22

type CreatingFor = { startISO: string; endISO: string } | null

interface CalendarViewProps {
  onStartRecordingFromEvent: (eventId: string, title: string) => void
  onOpenMeeting: (meetingId: string) => void
}

function getWeekStart(date: Date, weekStartsOn: number): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function detectWeekStart(): number {
  try {
    const info = (new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number }
    }).weekInfo
    if (info && typeof info.firstDay === 'number') {
      return info.firstDay === 7 ? 0 : info.firstDay
    }
  } catch {
    // ignore
  }
  return 0
}

function formatHourLabel(hour: number): string {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date)
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
}

function formatRangeHeader(start: Date, end: Date): string {
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const monthDayYear = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  if (sameMonth) {
    return `${monthDay.format(start)} – ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${monthDay.format(start)} – ${monthDayYear.format(end)}`
}

function isoForSlot(day: Date, hour: number, minute: number): string {
  const d = new Date(day)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

function minutesFromGridStart(date: Date): number {
  return (date.getHours() - SCROLL_START_HOUR) * 60 + date.getMinutes()
}

const TAG_COLORS: Record<string, string> = {
  red: '#FF3B30',
  blue: '#007AFF',
  green: '#34C759',
  yellow: '#FFCC00'
}

export function CalendarView({
  onStartRecordingFromEvent,
  onOpenMeeting
}: CalendarViewProps): React.JSX.Element {
  const [weekStartsOn] = useState(() => detectWeekStart())
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date(), weekStartsOn))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<CreatingFor>(null)
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const weekEnd = useMemo(() => addDays(weekAnchor, 7), [weekAnchor])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor]
  )

  const refresh = useCallback(async () => {
    try {
      const fetched = await window.mintAPI.calendar.list(
        weekAnchor.toISOString(),
        weekEnd.toISOString()
      )
      setEvents(fetched)
      setError(null)
    } catch (err) {
      console.error('Failed to load events', err)
      setError('Could not load events')
    }
  }, [weekAnchor, weekEnd])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.mintAPI
      .getTags()
      .then(setTags)
      .catch(() => setTags([]))
  }, [])

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(handle)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (VISIBLE_START_HOUR - SCROLL_START_HOUR) * HOUR_HEIGHT_PX
    }
  }, [])

  const tagColor = (tagId: string | undefined): string | null => {
    if (!tagId) return null
    const tag = tags.find((t) => t.id === tagId)
    if (tag) return tag.color
    return TAG_COLORS[tagId] ?? null
  }

  const eventsByDay = useMemo(() => {
    const grouped: CalendarEvent[][] = days.map(() => [])
    for (const event of events) {
      const start = new Date(event.startISO)
      const dayIndex = Math.floor((start.getTime() - weekAnchor.getTime()) / 86_400_000)
      if (dayIndex >= 0 && dayIndex < 7) {
        grouped[dayIndex].push(event)
      }
    }
    return grouped
  }, [events, days, weekAnchor])

  const handleSlotClick = (day: Date, hour: number, fractionalY: number): void => {
    const minute = snapToQuarter(Math.floor(fractionalY * 60))
    const startISO = isoForSlot(day, hour, minute)
    const endDate = new Date(startISO)
    endDate.setMinutes(endDate.getMinutes() + 30)
    setCreatingFor({ startISO, endISO: endDate.toISOString() })
  }

  const isToday = (day: Date): boolean => {
    const today = new Date()
    return (
      today.getFullYear() === day.getFullYear() &&
      today.getMonth() === day.getMonth() &&
      today.getDate() === day.getDate()
    )
  }

  const totalRows = SCROLL_END_HOUR - SCROLL_START_HOUR

  return (
    <div className="calendar-view">
      <div className="calendar-topbar">
        <div className="calendar-title">
          <div className="calendar-week-range">
            {formatRangeHeader(weekAnchor, addDays(weekAnchor, 6))}
          </div>
        </div>
        <div className="calendar-nav-buttons">
          <button onClick={() => setWeekAnchor(getWeekStart(new Date(), weekStartsOn))}>
            Today
          </button>
          <button
            onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <div className="calendar-spacer" />
        <button
          className="calendar-new-event"
          onClick={() => {
            const start = new Date(weekAnchor)
            start.setHours(9, 0, 0, 0)
            const end = new Date(start)
            end.setMinutes(end.getMinutes() + 30)
            setCreatingFor({ startISO: start.toISOString(), endISO: end.toISOString() })
          }}
        >
          + New event
        </button>
      </div>

      {error && <div className="calendar-error">{error}</div>}

      <div className="calendar-scroll" ref={scrollRef}>
        <div className="calendar-day-headers">
          <div className="calendar-corner" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`calendar-day-head ${isToday(day) ? 'today' : ''}`}
            >
              <div className="calendar-day-label">{formatDayLabel(day)}</div>
              <div className="calendar-day-num">{day.getDate()}</div>
            </div>
          ))}
        </div>
        <div
          className="calendar-grid"
          style={{ height: `${totalRows * HOUR_HEIGHT_PX}px` }}
        >
          <div className="calendar-time-col">
            {Array.from({ length: totalRows }, (_, i) => SCROLL_START_HOUR + i).map((hour) => (
              <div
                key={hour}
                className="calendar-time-slot"
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
              >
                <span className="calendar-time-label">{formatHourLabel(hour)}</span>
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              className={`calendar-day-col ${isToday(day) ? 'today' : ''}`}
              onClick={(clickEvent) => {
                if ((clickEvent.target as HTMLElement).closest('.calendar-event')) return
                const rect = (clickEvent.currentTarget as HTMLElement).getBoundingClientRect()
                const offsetY = clickEvent.clientY - rect.top
                const hour = SCROLL_START_HOUR + Math.floor(offsetY / HOUR_HEIGHT_PX)
                const fraction = (offsetY % HOUR_HEIGHT_PX) / HOUR_HEIGHT_PX
                handleSlotClick(day, hour, fraction)
              }}
            >
              {Array.from({ length: totalRows }).map((_, i) => (
                <div
                  key={i}
                  className="calendar-hour-row"
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                />
              ))}

              {eventsByDay[dayIndex].map((event) => {
                const start = new Date(event.startISO)
                const end = new Date(event.endISO)
                const top = minutesFromGridStart(start) * (HOUR_HEIGHT_PX / 60)
                const height = Math.max(
                  18,
                  ((end.getTime() - start.getTime()) / 60_000) * (HOUR_HEIGHT_PX / 60)
                )
                const color = tagColor(event.tagId)
                return (
                  <div
                    key={event.id}
                    className="calendar-event"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      borderLeftColor: color ?? '#5b8def',
                      backgroundColor: color
                        ? `color-mix(in srgb, ${color} 20%, transparent)`
                        : 'rgba(91,141,239,0.18)'
                    }}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      setEditingEventId(event.id)
                    }}
                  >
                    <div className="calendar-event-title">{event.title}</div>
                    <div className="calendar-event-time">
                      {new Intl.DateTimeFormat(undefined, {
                        hour: 'numeric',
                        minute: '2-digit'
                      }).format(start)}
                      {' – '}
                      {new Intl.DateTimeFormat(undefined, {
                        hour: 'numeric',
                        minute: '2-digit'
                      }).format(end)}
                    </div>
                  </div>
                )
              })}

              {isToday(day) && (
                <div
                  className="calendar-now-line"
                  style={{
                    top: `${minutesFromGridStart(now) * (HOUR_HEIGHT_PX / 60)}px`
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {creatingFor && (
        <EventModal
          mode="create"
          tags={tags}
          initial={{ startISO: creatingFor.startISO, endISO: creatingFor.endISO }}
          onClose={() => setCreatingFor(null)}
          onSaved={async () => {
            setCreatingFor(null)
            await refresh()
          }}
        />
      )}

      {editingEventId && (
        <EventModal
          mode="edit"
          tags={tags}
          eventId={editingEventId}
          onClose={() => setEditingEventId(null)}
          onSaved={async () => {
            setEditingEventId(null)
            await refresh()
          }}
          onDeleted={async () => {
            setEditingEventId(null)
            await refresh()
          }}
          onStartRecording={(title) => {
            const eventId = editingEventId
            setEditingEventId(null)
            if (eventId) onStartRecordingFromEvent(eventId, title)
          }}
          onOpenMeeting={(meetingId) => {
            setEditingEventId(null)
            onOpenMeeting(meetingId)
          }}
        />
      )}
    </div>
  )
}
