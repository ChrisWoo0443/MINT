import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Auth } from './components/Auth'
import { MeetingList } from './components/MeetingList'
import { MeetingDetail } from './components/MeetingDetail'
import { LiveRecording } from './components/LiveRecording'
import { Settings } from './components/Settings'

type View = 'meetings' | 'recording' | 'detail' | 'settings'

function AppContent(): React.JSX.Element {
  const { session } = useAuth()
  const [view, setView] = useState<View>('meetings')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [meetingListKey, setMeetingListKey] = useState(0)

  if (!session) return <Auth />

  const renderContent = (): React.JSX.Element => {
    if (view === 'recording') {
      return (
        <LiveRecording
          onStop={() => {
            window.mintAPI.stopRecording()
            setMeetingListKey((k) => k + 1)
            setView('meetings')
          }}
        />
      )
    }

    if (view === 'detail' && selectedMeetingId) {
      return (
        <MeetingDetail
          meetingId={selectedMeetingId}
          onBack={() => setView('meetings')}
        />
      )
    }

    if (view === 'settings') {
      return <Settings />
    }

    return (
      <MeetingList
        key={meetingListKey}
        onSelectMeeting={(meetingId) => {
          setSelectedMeetingId(meetingId)
          setView('detail')
        }}
        onStartRecording={async () => {
          try {
            const defaultTitle = `Meeting — ${new Date().toLocaleString()}`
            await window.mintAPI.startRecording({
              userId: session.user.id,
              title: defaultTitle,
              accessToken: session.access_token
            })
            setView('recording')
          } catch (error) {
            console.error('Failed to start recording:', error)
          }
        }}
      />
    )
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <button
          className={view === 'meetings' || view === 'detail' || view === 'recording' ? 'active' : ''}
          onClick={() => setView('meetings')}
        >
          Meetings
        </button>
        <button
          className={view === 'settings' ? 'active' : ''}
          onClick={() => setView('settings')}
        >
          Settings
        </button>
      </nav>
      <main className="main-content">{renderContent()}</main>
    </div>
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
