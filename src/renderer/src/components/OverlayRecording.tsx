import { useEffect, useRef, useState } from 'react'

interface TranscriptEntry {
  speaker: string | null
  content: string
  isFinal: boolean
}

export function OverlayRecording(): React.JSX.Element {
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
          const updated = [...finalEntries, { ...chunk }]
          return updated.slice(-4)
        }
        const otherInterims = prev.filter((e) => !e.isFinal && e.speaker !== chunk.speaker)
        const updated = [...finalEntries, ...otherInterims, { ...chunk }]
        return updated.slice(-4)
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

  const handleStop = async (): Promise<void> => {
    await window.mintAPI.stopRecording()
    window.mintAPI.destroyOverlay()
  }

  return (
    <div className="overlay-recording">
      <div className="overlay-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="overlay-recording-dot" />
        <span className="overlay-label">Recording</span>
        <span className="overlay-timer">{formatTime(elapsedSeconds)}</span>
      </div>
      <div className="overlay-transcript">
        {transcript.map((entry, index) => (
          <div key={index} className={`overlay-entry ${entry.isFinal ? '' : 'interim'}`}>
            {entry.speaker && <span className="overlay-speaker">{entry.speaker.slice(0, 12)}</span>}
            <span className="overlay-text">
              {entry.content.length > 60 ? entry.content.slice(0, 60) + '...' : entry.content}
            </span>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>
      <div className="overlay-footer" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button className="overlay-stop-button" onClick={handleStop}>
          Stop Recording
        </button>
      </div>
    </div>
  )
}
