import { useState, useEffect } from 'react'

interface AudioSetupProps {
  onComplete: (displayName: string) => void
}

export function AudioSetup({ onComplete }: AudioSetupProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState('')
  const [storagePath, setStoragePath] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.mintAPI.getStoragePath().then(setStoragePath)
  }, [])

  const handlePickFolder = async (): Promise<void> => {
    const picked = await window.mintAPI.pickStorageFolder()
    if (picked) {
      setStoragePath(picked)
      await window.mintAPI.setStoragePath(picked)
    }
  }

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

            <label htmlFor="storage-path">Storage Folder</label>
            <div className="storage-picker">
              <input
                id="storage-path"
                type="text"
                value={storagePath}
                readOnly
                placeholder="Choose a folder..."
              />
              <button type="button" onClick={handlePickFolder}>
                Browse
              </button>
            </div>
            <p className="setup-hint">Meeting transcripts and notes will be saved here.</p>
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
