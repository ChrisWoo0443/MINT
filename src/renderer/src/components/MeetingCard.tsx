interface Meeting {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: string
}

interface MeetingCardProps {
  meeting: Meeting
  onClick: () => void
  onDelete: (meetingId: string) => void
}

export function MeetingCard({ meeting, onClick, onDelete }: MeetingCardProps): React.JSX.Element {
  const date = new Date(meeting.startedAt).toLocaleDateString()
  const duration = meeting.endedAt
    ? formatDuration(new Date(meeting.startedAt), new Date(meeting.endedAt))
    : 'In progress'

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (window.confirm('Delete this meeting? This cannot be undone.')) {
      onDelete(meeting.id)
    }
  }

  return (
    <div className="meeting-card" onClick={onClick}>
      <div className="meeting-card-header">
        <h3>{meeting.title}</h3>
      </div>
      <p>{date}</p>
      <p>{duration}</p>
      <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>
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
