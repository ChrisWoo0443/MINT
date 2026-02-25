import { useEffect, useRef, useState } from 'react'

interface TranscriptEntry {
  speaker: string | null
  content: string
  timestampStart: number
  isFinal: boolean
}

interface LiveRecordingProps {
  onStop: () => void
}

export function LiveRecording({ onStop }: LiveRecordingProps): React.JSX.Element {
  const [title, setTitle] = useState(`Meeting — ${new Date().toLocaleString()}`)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const cleanup = window.mintAPI.onTranscriptChunk((chunk) => {
      setTranscript((prev) => {
        const finalEntries = prev.filter((e) => e.isFinal)
        if (chunk.isFinal) {
          return [...finalEntries, { ...chunk }]
        }
        // Keep interim entries from other speakers, replace only this speaker's interim
        const otherInterims = prev.filter((e) => !e.isFinal && e.speaker !== chunk.speaker)
        return [...finalEntries, ...otherInterims, { ...chunk }]
      })
    })
    return cleanup
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
    return `${minutes}:${remainingSeconds}`
  }

  return (
    <div className="live-recording">
      <div className="recording-header">
        <input
          className="meeting-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="recording-timer">{formatTime(elapsedSeconds)}</span>
        <span className="recording-indicator" />
        <button className="stop-button" onClick={onStop}>
          Stop Recording
        </button>
      </div>
      <div className="transcript-feed">
        {transcript.map((entry, index) => (
          <div key={index} className={`transcript-entry ${entry.isFinal ? '' : 'interim'}`}>
            {entry.speaker && <span className="speaker-label">{entry.speaker}</span>}
            <span className="transcript-text">{entry.content}</span>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  )
}
