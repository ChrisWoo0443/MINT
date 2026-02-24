import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Auth } from './components/Auth'
import { MeetingList } from './components/MeetingList'

type View = 'meetings' | 'recording' | 'detail'

function AppContent(): React.JSX.Element {
  const { session } = useAuth()
  const [view, setView] = useState<View>('meetings')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)

  if (!session) return <Auth />

  if (view === 'recording') {
    return (
      <div>
        <button onClick={() => setView('meetings')}>Back to Meetings</button>
        <p>Recording view placeholder</p>
      </div>
    )
  }

  if (view === 'detail' && selectedMeetingId) {
    return (
      <div>
        <button onClick={() => setView('meetings')}>Back to Meetings</button>
        <p>Meeting detail placeholder for {selectedMeetingId}</p>
      </div>
    )
  }

  return (
    <MeetingList
      onSelectMeeting={(meetingId) => {
        setSelectedMeetingId(meetingId)
        setView('detail')
      }}
      onStartRecording={() => setView('recording')}
    />
  )
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
