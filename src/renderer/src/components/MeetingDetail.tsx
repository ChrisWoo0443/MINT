import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Meeting {
  id: string
  title: string
  started_at: string
  ended_at: string | null
  status: string
}

interface Note {
  summary: string
  decisions: string[]
  action_items: Array<{ task: string; assignee?: string; dueDate?: string }>
}

interface Transcript {
  speaker: string | null
  content: string
  timestamp_start: number
}

type ActiveTab = 'summary' | 'transcript'

interface MeetingDetailProps {
  meetingId: string
  onBack: () => void
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps): React.JSX.Element {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [notes, setNotes] = useState<Note | null>(null)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadMeetingData()
  }, [meetingId])

  const loadMeetingData = async (): Promise<void> => {
    const [meetingResult, notesResult, transcriptsResult] = await Promise.all([
      supabase.from('meetings').select('*').eq('id', meetingId).single(),
      supabase.from('notes').select('*').eq('meeting_id', meetingId).single(),
      supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('timestamp_start', { ascending: true })
    ])

    if (meetingResult.data) setMeeting(meetingResult.data)
    if (notesResult.data) setNotes(notesResult.data)
    if (transcriptsResult.data) setTranscripts(transcriptsResult.data)
  }

  const filteredTranscripts = transcripts.filter((transcript) =>
    transcript.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isProcessing = meeting?.status === 'processing' && notes === null

  if (!meeting) {
    return (
      <div className="meeting-detail">
        <button onClick={onBack}>Back to Meetings</button>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="meeting-detail">
      <button className="back-button" onClick={onBack}>
        Back to Meetings
      </button>

      <h2>{meeting.title}</h2>
      <p className="meeting-date">{new Date(meeting.started_at).toLocaleString()}</p>
      <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'summary' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === 'transcript' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="tab-content">
          {isProcessing ? (
            <p>Generating notes...</p>
          ) : notes ? (
            <div className="summary-content">
              <section className="summary-section">
                <h3>Executive Summary</h3>
                <p>{notes.summary}</p>
              </section>

              {notes.decisions.length > 0 && (
                <section className="summary-section">
                  <h3>Decisions</h3>
                  <ul>
                    {notes.decisions.map((decision, index) => (
                      <li key={index}>{decision}</li>
                    ))}
                  </ul>
                </section>
              )}

              {notes.action_items.length > 0 && (
                <section className="summary-section">
                  <h3>Action Items</h3>
                  <ul className="action-items">
                    {notes.action_items.map((item, index) => (
                      <li key={index} className="action-item">
                        <label>
                          <input type="checkbox" />
                          <span>{item.task}</span>
                          {item.assignee && (
                            <span className="action-assignee"> — {item.assignee}</span>
                          )}
                          {item.dueDate && (
                            <span className="action-due-date"> (due: {item.dueDate})</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <p>No notes available for this meeting.</p>
          )}
        </div>
      )}

      {activeTab === 'transcript' && (
        <div className="tab-content">
          <input
            className="transcript-search"
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {filteredTranscripts.length === 0 ? (
            <p>No transcript entries found.</p>
          ) : (
            <div className="transcript-list">
              {filteredTranscripts.map((transcript, index) => (
                <div key={index} className="transcript-row">
                  <span className="transcript-timestamp">
                    {formatTimestamp(transcript.timestamp_start)}
                  </span>
                  <span className="transcript-speaker">{transcript.speaker ?? 'Unknown'}</span>
                  <span className="transcript-content">{transcript.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
