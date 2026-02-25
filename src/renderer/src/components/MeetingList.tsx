import { useCallback, useEffect, useState } from 'react'
import { MeetingCard } from './MeetingCard'

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

interface MeetingListProps {
  onSelectMeeting: (meetingId: string) => void
  onStartRecording: () => void
}

export function MeetingList({
  onSelectMeeting,
  onStartRecording
}: MeetingListProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([])

  const loadData = useCallback(async (): Promise<void> => {
    const [meetingsData, tagsData] = await Promise.all([
      window.mintAPI.listMeetings(),
      window.mintAPI.getTags()
    ])
    setMeetings(meetingsData)
    setAvailableTags(tagsData)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const handleDeleteMeeting = async (meetingId: string): Promise<void> => {
    await window.mintAPI.deleteMeeting(meetingId)
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
  }

  const handleToggleTag = async (meetingId: string, tagId: string): Promise<void> => {
    const meeting = meetings.find((m) => m.id === meetingId)
    if (!meeting) return
    const currentTags = meeting.tags ?? []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId]
    await window.mintAPI.setMeetingTags(meetingId, newTags)
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, tags: newTags } : m)))
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
            availableTags={availableTags}
            onClick={() => onSelectMeeting(meeting.id)}
            onDelete={handleDeleteMeeting}
            onToggleTag={handleToggleTag}
          />
        ))
      )}
    </div>
  )
}
