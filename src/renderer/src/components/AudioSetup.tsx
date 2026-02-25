import { useState } from 'react'

interface AudioSetupProps {
  onComplete: (displayName: string) => void
}

export function AudioSetup({ onComplete }: AudioSetupProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (): void => {
    if (!displayName.trim()) {
      setError('Please enter your name.')
      return
    }
    onComplete(displayName)
  }

  return (
    <div className="audio-setup">
      <div className="audio-setup-card">
        <div className="setup-step">
          <h1>Welcome to MINT</h1>
          <p>Meeting Intelligence Notes & Transcription</p>
          <div className="setup-step-content">
            <label htmlFor="display-name">Your Name</label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <p className="setup-hint">This is used to label your voice in meeting transcripts.</p>
          </div>
          {error && <p className="error">{error}</p>}
          <button onClick={handleSubmit} disabled={!displayName.trim()}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  )
}
