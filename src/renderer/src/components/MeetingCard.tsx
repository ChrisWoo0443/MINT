import { useEffect, useRef, useState } from 'react'
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

interface MoveTarget {
  id: string
  name: string
}

interface MeetingCardProps {
  meeting: Meeting
  availableTags: TagDefinition[]
  onClick: () => void
  onDelete: (meetingId: string) => void
  onToggleTag: (meetingId: string, tagId: string) => void
  moveTargets: MoveTarget[]
  currentSection: string | null
  onMove: (meetingId: string, targetSectionId: string | null) => void
}

export function MeetingCard({
  meeting,
  availableTags,
  onClick,
  onDelete,
  onToggleTag,
  moveTargets,
  currentSection,
  onMove
}: MeetingCardProps): React.JSX.Element {
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)

  const date = new Date(meeting.startedAt).toLocaleDateString()
  const duration = meeting.endedAt
    ? formatDuration(new Date(meeting.startedAt), new Date(meeting.endedAt))
    : 'In progress'

  const meetingTags = meeting.tags ?? []
  const assignedTags = availableTags.filter((t) => meetingTags.includes(t.id))

  useEffect(() => {
    if (!moveOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [moveOpen])

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (window.confirm('Delete this meeting? This cannot be undone.')) {
      onDelete(meeting.id)
    }
  }

  const handleMoveClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setMoveOpen((prev) => !prev)
  }

  const handleMove = (e: React.MouseEvent, targetId: string | null): void => {
    e.stopPropagation()
    onMove(meeting.id, targetId)
    setMoveOpen(false)
  }

  return (
    <div className="meeting-card" onClick={onClick}>
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
      {moveTargets.length > 0 && (
        <div className="move-picker" ref={moveRef}>
          <button className="move-picker-button" onClick={handleMoveClick} title="Move to section">
            &#8693;
          </button>
          {moveOpen && (
            <div className="move-picker-dropdown">
              {currentSection && (
                <button
                  className="move-picker-option"
                  onClick={(e) => handleMove(e, null)}
                >
                  Remove from section
                </button>
              )}
              {moveTargets
                .filter((t) => t.id !== currentSection)
                .map((target) => (
                  <button
                    key={target.id}
                    className="move-picker-option"
                    onClick={(e) => handleMove(e, target.id)}
                  >
                    {target.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
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
