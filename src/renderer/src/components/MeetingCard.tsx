import { TagPicker } from './TagPicker'

interface TagDefinition {
  id: string
  name: string
  color: string
}

interface Meeting {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: string
  tags?: string[]
}

interface MeetingCardProps {
  meeting: Meeting
  availableTags: TagDefinition[]
  onClick: () => void
  onDelete: (meetingId: string) => void
  onToggleTag: (meetingId: string, tagId: string) => void
}

export function MeetingCard({
  meeting,
  availableTags,
  onClick,
  onDelete,
  onToggleTag
}: MeetingCardProps): React.JSX.Element {
  const date = new Date(meeting.startedAt).toLocaleDateString()
  const duration = meeting.endedAt
    ? formatDuration(new Date(meeting.startedAt), new Date(meeting.endedAt))
    : 'In progress'

  const meetingTags = meeting.tags ?? []
  const assignedTags = availableTags.filter((t) => meetingTags.includes(t.id))

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (window.confirm('Delete this meeting? This cannot be undone.')) {
      onDelete(meeting.id)
    }
  }

  const handleDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.setData('text/plain', meeting.id)
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('dragging')
  }

  const handleDragEnd = (e: React.DragEvent): void => {
    ;(e.currentTarget as HTMLElement).classList.remove('dragging')
  }

  return (
    <div
      className="meeting-card"
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="drag-handle"
        onMouseDown={(e) => e.stopPropagation()}
        title="Drag to move"
      >
        <span className="drag-dots" />
      </div>
      <div className="meeting-card-header">
        <div className="meeting-card-tags">
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className="tag-dot"
              style={{ background: tag.color }}
              title={tag.name}
            />
          ))}
        </div>
        <h3>{meeting.title}</h3>
      </div>
      <p>{date}</p>
      <p>{duration}</p>
      <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>
      <TagPicker
        tags={availableTags}
        selectedTagIds={meetingTags}
        onToggleTag={(tagId) => onToggleTag(meeting.id, tagId)}
      />
      <button className="delete-button" onClick={handleDelete} title="Delete meeting">
        ✕
      </button>
    </div>
  )
}

function formatDuration(start: Date, end: Date): string {
  const totalSeconds = Math.round((end.getTime() - start.getTime()) / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
