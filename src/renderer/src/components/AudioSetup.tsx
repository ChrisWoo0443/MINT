import { useState } from 'react'

interface AudioSetupProps {
  onComplete: (displayName: string) => void
}

async function detectBlackHole(): Promise<{ installed: boolean; deviceId: string }> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const blackhole = devices.find(
    (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes('blackhole')
  )
  return { installed: !!blackhole, deviceId: blackhole?.deviceId || '' }
}

export function AudioSetup({ onComplete }: AudioSetupProps): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleVerifyBlackHole = async (): Promise<void> => {
    setVerifying(true)
    setError('')
    const result = await detectBlackHole()
    setVerifying(false)
    if (result.installed) {
      localStorage.setItem('blackholeDeviceId', result.deviceId)
      setStep(step + 1)
    } else {
      setError('BlackHole was not detected. Please install it and try again.')
    }
  }

  const handleFinalVerify = async (): Promise<void> => {
    setVerifying(true)
    setError('')
    const result = await detectBlackHole()
    setVerifying(false)
    if (result.installed) {
      localStorage.setItem('blackholeDeviceId', result.deviceId)
      onComplete(displayName)
    } else {
      setError('BlackHole was not detected. Please check your audio setup and try again.')
    }
  }

  const handleNameSubmit = (): void => {
    if (!displayName.trim()) {
      setError('Please enter your name.')
      return
    }
    setError('')
    setStep(1)
  }

  return (
    <div className="audio-setup">
      <div className="audio-setup-card">
        <div className="setup-progress">
          {[0, 1, 2, 3].map((s) => (
            <div key={s} className={`setup-progress-dot ${s <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 0 && (
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
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              />
              <p className="setup-hint">This is used to label your voice in meeting transcripts.</p>
            </div>
            {error && <p className="error">{error}</p>}
            <button onClick={handleNameSubmit} disabled={!displayName.trim()}>
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="setup-step">
            <h2>Install BlackHole 2ch</h2>
            <div className="setup-step-content">
              <p>
                MINT uses BlackHole, a free virtual audio driver, to capture meeting audio
                separately from your microphone. This lets us distinguish your voice from other
                participants.
              </p>
              <ol className="setup-instructions">
                <li>Download BlackHole 2ch from the official site</li>
                <li>Run the installer and follow the prompts</li>
                <li>Restart may be required after installation</li>
              </ol>
              <button
                className="setup-action-button"
                onClick={() => window.mintAPI.openExternal('https://existential.audio/blackhole/')}
              >
                Download BlackHole 2ch
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <button onClick={handleVerifyBlackHole} disabled={verifying}>
              {verifying ? 'Checking...' : "I've installed it, continue"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="setup-step">
            <h2>Create Multi-Output Device</h2>
            <div className="setup-step-content">
              <p>
                A Multi-Output Device lets you hear meeting audio through your speakers while MINT
                captures it through BlackHole.
              </p>
              <ol className="setup-instructions">
                <li>Open Audio MIDI Setup</li>
                <li>
                  Click the <strong>+</strong> button in the bottom left
                </li>
                <li>
                  Select <strong>Create Multi-Output Device</strong>
                </li>
                <li>
                  Check both your speakers/headphones and <strong>BlackHole 2ch</strong>
                </li>
              </ol>
              <button
                className="setup-action-button"
                onClick={() =>
                  window.mintAPI.openApp('/Applications/Utilities/Audio MIDI Setup.app')
                }
              >
                Open Audio MIDI Setup
              </button>
            </div>
            <button onClick={() => setStep(3)}>Done, continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="setup-step">
            <h2>Set System Output</h2>
            <div className="setup-step-content">
              <p>
                Set your new Multi-Output Device as the system sound output so meeting audio flows
                through BlackHole.
              </p>
              <ol className="setup-instructions">
                <li>Open System Settings &rarr; Sound</li>
                <li>
                  Under <strong>Output</strong>, select your Multi-Output Device
                </li>
              </ol>
              <button
                className="setup-action-button"
                onClick={() =>
                  window.mintAPI.openExternal(
                    'x-apple.systempreferences:com.apple.Sound-Settings.extension'
                  )
                }
              >
                Open Sound Settings
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <button onClick={handleFinalVerify} disabled={verifying}>
              {verifying ? 'Verifying...' : 'Verify Setup'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
