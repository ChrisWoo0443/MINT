import { useEffect, useRef, useState } from 'react'
import type { TranscriptionDegradedEvent, TranscriptionDegradedSource } from '../types/global'

interface TranscriptEntry {
  speaker: string | null
  content: string
  timestampStart: number
  isFinal: boolean
}

type DegradationStatus =
  | { kind: 'reconnecting'; attempt: number }
  | { kind: 'dropped'; droppedBytes: number }
  | { kind: 'terminal'; reason: string }

type DegradationBySource = Partial<Record<TranscriptionDegradedSource, DegradationStatus>>

interface LiveRecordingProps {
  onStop: () => void
}

export function LiveRecording({ onStop }: LiveRecordingProps): React.JSX.Element {
  const [title, setTitle] = useState(`Meeting — ${new Date().toLocaleString()}`)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [degradation, setDegradation] = useState<DegradationBySource>({})
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
    const cleanupDegraded = window.mintAPI.onTranscriptionDegraded(
      (event: TranscriptionDegradedEvent) => {
        setDegradation((prev) => {
          const next: DegradationBySource = { ...prev }
          switch (event.kind) {
            case 'reconnecting':
              next[event.source] = { kind: 'reconnecting', attempt: event.attempt }
              break
            case 'recovered':
              delete next[event.source]
              break
            case 'dropped':
              next[event.source] = { kind: 'dropped', droppedBytes: event.droppedBytes }
              break
            case 'terminal':
              next[event.source] = { kind: 'terminal', reason: event.reason }
              break
          }
          return next
        })
      }
    )
    const cleanupStatus = window.mintAPI.onRecordingStatus((status) => {
      if (status === 'stopped' || status === 'error') {
        // Clear stale banners so they don't persist into the next meeting view.
        setDegradation({})
      }
    })
    return () => {
      cleanupDegraded()
      cleanupStatus()
    }
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

  const degradationBanners = (
    Object.entries(degradation) as Array<[TranscriptionDegradedSource, DegradationStatus]>
  ).map(([source, status]) => {
    const sourceLabel = source === 'mic' ? 'Microphone' : 'System audio'
    let message: string
    let severity: 'warn' | 'error'
    switch (status.kind) {
      case 'reconnecting':
        message = `${sourceLabel}: reconnecting${
          status.attempt > 1 ? ` (attempt ${status.attempt})` : '…'
        }`
        severity = 'warn'
        break
      case 'dropped':
        message = `${sourceLabel}: audio dropped during reconnect (${Math.round(
          status.droppedBytes / 1024
        )} KB)`
        severity = 'warn'
        break
      case 'terminal':
        message = `${sourceLabel}: transcription stopped — ${status.reason}`
        severity = 'error'
        break
    }
    return (
      <div
        key={source}
        className={`transcription-degraded-banner transcription-degraded-${severity}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    )
  })

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
      {degradationBanners.length > 0 && (
        <div className="transcription-degraded-banners">{degradationBanners}</div>
      )}
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
