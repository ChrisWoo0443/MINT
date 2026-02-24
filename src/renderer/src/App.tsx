import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Auth } from './components/Auth'
import { MeetingList } from './components/MeetingList'
import { LiveRecording } from './components/LiveRecording'

type View = 'meetings' | 'recording' | 'detail'

function AppContent(): React.JSX.Element {
  const { session } = useAuth()
  const [view, setView] = useState<View>('meetings')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)

  if (!session) return <Auth />

  if (view === 'recording') {
    return (
      <LiveRecording
        onStop={async () => {
          await window.mintAPI.stopRecording()
          setView('meetings')
        }}
      />
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
      onStartRecording={async () => {
        const defaultTitle = `Meeting — ${new Date().toLocaleString()}`
        await window.mintAPI.startRecording({
          userId: session.user.id,
          title: defaultTitle,
          accessToken: session.access_token
        })
        setView('recording')
      }}
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
