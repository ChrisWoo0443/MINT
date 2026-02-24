import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MeetingCard } from './MeetingCard'

interface Meeting {
  id: string
  title: string
  started_at: string
  ended_at: string | null
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

  useEffect(() => {
    loadMeetings()
  }, [])

  const loadMeetings = async (): Promise<void> => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .order('started_at', { ascending: false })
    if (data) setMeetings(data)
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
          />
        ))
      )}
    </div>
  )
}
