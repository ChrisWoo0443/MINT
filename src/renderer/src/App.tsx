import { useState } from 'react'
import { MeetingList } from './components/MeetingList'
import { MeetingDetail } from './components/MeetingDetail'
import { LiveRecording } from './components/LiveRecording'
import { Settings } from './components/Settings'
import { AudioSetup } from './components/AudioSetup'

type View = 'meetings' | 'recording' | 'detail' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('meetings')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [meetingListKey, setMeetingListKey] = useState(0)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('onboardingComplete') === 'true'
  )

  const handleOnboardingComplete = (displayName: string): void => {
    localStorage.setItem('displayName', displayName)
    localStorage.setItem('onboardingComplete', 'true')
    setOnboardingComplete(true)
  }

  if (!onboardingComplete) {
    return <AudioSetup onComplete={handleOnboardingComplete} />
  }

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
      return <MeetingDetail meetingId={selectedMeetingId} onBack={() => setView('meetings')} />
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
            const userName = localStorage.getItem('displayName') || 'You'
            await window.mintAPI.startRecording({
              title: defaultTitle,
              userName,
              micDeviceId: localStorage.getItem('micDeviceId') || undefined
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
          className={
            view === 'meetings' || view === 'detail' || view === 'recording' ? 'active' : ''
          }
          onClick={() => setView('meetings')}
        >
          Meetings
        </button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
          Settings
        </button>
      </nav>
      <main className="main-content">{renderContent()}</main>
    </div>
  )
}

export default App
