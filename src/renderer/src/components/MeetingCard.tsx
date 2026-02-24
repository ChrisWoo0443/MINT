interface Meeting {
  id: string
  title: string
  started_at: string
  ended_at: string | null
  status: string
}

interface MeetingCardProps {
  meeting: Meeting
  onClick: () => void
}

export function MeetingCard({ meeting, onClick }: MeetingCardProps): React.JSX.Element {
  const date = new Date(meeting.started_at).toLocaleDateString()
  const duration = meeting.ended_at
    ? formatDuration(new Date(meeting.started_at), new Date(meeting.ended_at))
    : 'In progress'

  return (
    <div className="meeting-card" onClick={onClick}>
      <h3>{meeting.title}</h3>
      <p>{date}</p>
      <p>{duration}</p>
      <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>
    </div>
  )
}

function formatDuration(start: Date, end: Date): string {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
