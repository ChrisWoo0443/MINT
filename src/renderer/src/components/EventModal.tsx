import { useEffect, useState } from 'react'
import type { TagDefinition } from '../../../shared/api-types'

type Mode = 'create' | 'edit'

interface BaseProps {
  mode: Mode
  tags: TagDefinition[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}

interface CreateProps extends BaseProps {
  mode: 'create'
  initial: { startISO: string; endISO: string }
}

interface EditProps extends BaseProps {
  mode: 'edit'
  eventId: string
  onDeleted: () => void | Promise<void>
  onStartRecording: (title: string) => void
}

type EventModalProps = CreateProps | EditProps

const MAX_TITLE_LEN = 200
const MAX_NOTES_LEN = 2000

function isoToLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToISO(value: string): string {
  return new Date(value).toISOString()
}

export function EventModal(props: EventModalProps): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [notes, setNotes] = useState('')
  const [tagId, setTagId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (props.mode === 'create') {
      setStartLocal(isoToLocalInput(props.initial.startISO))
      setEndLocal(isoToLocalInput(props.initial.endISO))
    } else {
      void window.mintAPI.calendar.get(props.eventId).then((event) => {
        if (!event) return
        setTitle(event.title)
        setStartLocal(isoToLocalInput(event.startISO))
        setEndLocal(isoToLocalInput(event.endISO))
        setNotes(event.notes ?? '')
        setTagId(event.tagId ?? '')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required'
    if (title.length > MAX_TITLE_LEN) return `Title must be ≤ ${MAX_TITLE_LEN} chars`
    if (notes.length > MAX_NOTES_LEN) return `Notes must be ≤ ${MAX_NOTES_LEN} chars`
    const startMs = Date.parse(localInputToISO(startLocal))
    const endMs = Date.parse(localInputToISO(endLocal))
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'Start and end must be valid'
    if (endMs <= startMs) return 'End must be after start'
    return null
  }

  const handleSave = async (): Promise<void> => {
    const err = validate()
    if (err) {
      setValidationError(err)
      return
    }
    setLoading(true)
    setValidationError(null)
    try {
      const payload = {
        title: title.trim(),
        startISO: localInputToISO(startLocal),
        endISO: localInputToISO(endLocal),
        notes: notes.trim() ? notes.trim() : undefined,
        tagId: tagId || undefined
      }
      if (props.mode === 'create') {
        await window.mintAPI.calendar.create(payload)
      } else {
        await window.mintAPI.calendar.update(props.eventId, payload)
      }
      await props.onSaved()
    } catch (e) {
      console.error(e)
      setValidationError('Failed to save event')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (props.mode !== 'edit') return
    if (!confirm('Delete this event?')) return
    setLoading(true)
    try {
      await window.mintAPI.calendar.delete(props.eventId)
      await props.onDeleted()
    } catch (e) {
      console.error(e)
      setValidationError('Failed to delete event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="event-modal-backdrop" onClick={props.onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.mode === 'create' ? 'New event' : 'Edit event'}</h3>
        <label>
          Title
          <input
            type="text"
            value={title}
            maxLength={MAX_TITLE_LEN}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Start
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </label>
        <label>
          End
          <input
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
          />
        </label>
        <label>
          Tag
          <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">No tag</option>
            {props.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            maxLength={MAX_NOTES_LEN}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
          <span className="event-modal-counter">
            {notes.length} / {MAX_NOTES_LEN}
          </span>
        </label>

        {validationError && <div className="event-modal-error">{validationError}</div>}

        <div className="event-modal-actions">
          {props.mode === 'edit' && (
            <button
              className="event-modal-record"
              disabled={loading || !title.trim()}
              onClick={() => props.onStartRecording(title.trim())}
            >
              ● Start recording
            </button>
          )}
          <div className="event-modal-spacer" />
          {props.mode === 'edit' && (
            <button
              className="event-modal-delete"
              disabled={loading}
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          <button onClick={props.onClose} disabled={loading}>
            Cancel
          </button>
          <button className="event-modal-save" onClick={handleSave} disabled={loading}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
