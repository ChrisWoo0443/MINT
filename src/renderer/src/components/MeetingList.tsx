import { useCallback, useEffect, useState } from 'react'
import { MeetingCard } from './MeetingCard'

interface Meeting {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: string
}

interface MeetingListProps {
  onSelectMeeting: (meetingId: string) => void
  onStartRecording: () => void
}

export function MeetingList({
  onSelectMeeting,
  onStartRecording
}: MeetingListProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([])

  const loadMeetings = useCallback(async (): Promise<void> => {
    const data = await window.mintAPI.listMeetings()
    setMeetings(data)
  }, [])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  const handleDeleteMeeting = async (meetingId: string): Promise<void> => {
    await window.mintAPI.deleteMeeting(meetingId)
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
  }

  return (
    <div className="meeting-list">
      <div className="meeting-list-header">
        <h2>Meetings</h2>
        <button onClick={onStartRecording}>Start Recording</button>
      </div>
      {meetings.length === 0 ? (
        <p>No meetings yet. Start your first recording.</p>
      ) : (
        meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            onClick={() => onSelectMeeting(meeting.id)}
            onDelete={handleDeleteMeeting}
          />
        ))
      )}
    </div>
  )
}
