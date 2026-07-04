import { useState, useEffect } from 'react'
import { MeetingList } from './components/MeetingList'
import { MeetingDetail } from './components/MeetingDetail'
import { LiveRecording } from './components/LiveRecording'
import { OverlayRecording } from './components/OverlayRecording'
import { Settings } from './components/Settings'
import { AudioSetup } from './components/AudioSetup'

type View = 'meetings' | 'recording' | 'detail' | 'settings'

const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'

const storedTranscriptionProvider = localStorage.getItem('transcriptionProvider')
if (!storedTranscriptionProvider) {
  const existingDeepgramKey = localStorage.getItem('deepgramApiKey')
  if (existingDeepgramKey && existingDeepgramKey.trim().length > 0) {
    localStorage.setItem('transcriptionProvider', 'deepgram')
  } else {
    localStorage.setItem('transcriptionProvider', 'local')
  }
}

for (const legacyKeyName of ['deepgramApiKey', 'openaiApiKey'] as const) {
  const legacyValue = localStorage.getItem(legacyKeyName)
  if (legacyValue) {
    void window.mintAPI.secrets.set(legacyKeyName, legacyValue).then(() => {
      localStorage.removeItem(legacyKeyName)
    })
  }
}

function App(): React.JSX.Element {
  if (isOverlay) {
    return <OverlayRecording />
  }

  return <MainApp />
}

function MainApp(): React.JSX.Element {
  const [view, setView] = useState<View>('meetings')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null)
  const [meetingListKey, setMeetingListKey] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('onboardingComplete') === 'true'
  )

  useEffect(() => {
    if (!isRecording) return

    const cleanupBlur = window.mintAPI.onWindowBlur(() => {
      window.mintAPI.showOverlay()
    })

    const cleanupFocus = window.mintAPI.onWindowFocus(() => {
      window.mintAPI.hideOverlay()
    })

    const cleanupStatus = window.mintAPI.onRecordingStatus((status) => {
      if (status === 'stopped') {
        setIsRecording(false)
        setMeetingListKey((k) => k + 1)
        setView('meetings')
      }
    })

    return () => {
      cleanupBlur()
      cleanupFocus()
      cleanupStatus()
    }
  }, [isRecording])

  const handleOnboardingComplete = (displayName: string): void => {
    localStorage.setItem('displayName', displayName)
    localStorage.setItem('onboardingComplete', 'true')
    setOnboardingComplete(true)
  }

  const startRecordingWithTitle = async (title: string, eventIdToLink?: string): Promise<void> => {
    try {
      const userName = localStorage.getItem('displayName') || 'You'
      const transcriptionProvider =
        (localStorage.getItem('transcriptionProvider') as 'local' | 'deepgram' | null) ?? 'local'
      const whisperModel =
        (localStorage.getItem('whisperModel') as
          | 'tiny.en'
          | 'base.en'
          | 'small.en'
          | 'medium.en'
          | null) ?? 'small.en'
      const meetingId = await window.mintAPI.startRecording({
        title,
        userName,
        micDeviceId: localStorage.getItem('micDeviceId') || undefined,
        transcriptionProvider,
        whisperModel
      })
      // Calendar view is currently hidden; this link path is kept for when it returns.
      if (eventIdToLink && meetingId) {
        try {
          const linkedEvent = await window.mintAPI.calendar.get(eventIdToLink)
          await window.mintAPI.calendar.update(eventIdToLink, { meetingId })
          if (linkedEvent?.tagId) {
            await window.mintAPI.setMeetingTags(meetingId, [linkedEvent.tagId])
          }
        } catch (linkError) {
          console.error('Failed to link calendar event to meeting:', linkError)
        }
      }
      setIsRecording(true)
      setView('recording')
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
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
            setIsRecording(false)
            window.mintAPI.destroyOverlay()
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
          highlightQuery={highlightQuery}
          onBack={() => setView('meetings')}
        />
      )
    }

    if (view === 'settings') {
      return (
        <Settings
          onRerunOnboarding={() => {
            localStorage.removeItem('onboardingComplete')
            setOnboardingComplete(false)
          }}
          onResetApp={() => {
            void window.mintAPI.secrets.set('deepgramApiKey', '')
            void window.mintAPI.secrets.set('openaiApiKey', '')
            localStorage.clear()
            setOnboardingComplete(false)
          }}
        />
      )
    }

    return (
      <MeetingList
        key={meetingListKey}
        onSelectMeeting={(meetingId, searchQuery) => {
          setSelectedMeetingId(meetingId)
          setHighlightQuery(searchQuery && searchQuery.length > 0 ? searchQuery : null)
          setView('detail')
        }}
        onStartRecording={async () => {
          const defaultTitle = `Meeting — ${new Date().toLocaleString()}`
          await startRecordingWithTitle(defaultTitle)
        }}
      />
    )
  }

  return (
    <>
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
          <button
            className={view === 'settings' ? 'active' : ''}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
        <main className="main-content">{renderContent()}</main>
      </div>
    </>
  )
}

export default App
