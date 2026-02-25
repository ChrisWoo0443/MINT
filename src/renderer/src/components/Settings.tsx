import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface SettingsProps {
  onRerunSetup: () => void
}

export function Settings({ onRerunSetup }: SettingsProps): React.JSX.Element {
  const { user, signOut } = useAuth()
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('displayName') || ''
  )
  const [blackholeDetected, setBlackholeDetected] = useState(false)

  const loadDevices = useCallback(async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter(
      (d) => d.kind === 'audioinput' && !d.label.toLowerCase().includes('blackhole')
    )
    setAudioDevices(audioInputs)
    if (audioInputs.length > 0 && !selectedDevice) {
      setSelectedDevice(audioInputs[0].deviceId)
    }

    const blackhole = devices.find(
      (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes('blackhole')
    )
    setBlackholeDetected(!!blackhole)
  }, [selectedDevice])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const handleDeviceChange = async (deviceId: string): Promise<void> => {
    setSelectedDevice(deviceId)
    localStorage.setItem('micDeviceId', deviceId)
    await window.mintAPI.setAudioDevice(deviceId)
  }

  const handleNameChange = (name: string): void => {
    setDisplayName(name)
    localStorage.setItem('displayName', name)
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section>
        <h3>Profile</h3>
        <label htmlFor="display-name">Display Name</label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Your name"
        />
      </section>

      <section>
        <h3>Audio</h3>
        <label htmlFor="audio-device">Microphone</label>
        <select
          id="audio-device"
          value={selectedDevice}
          onChange={(e) => handleDeviceChange(e.target.value)}
        >
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>

        <label style={{ marginTop: 16 }}>System Audio</label>
        <p>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: blackholeDetected ? 'var(--color-status-completed)' : 'var(--color-status-failed)',
              marginRight: 8
            }}
          />
          {blackholeDetected ? 'BlackHole 2ch detected' : 'BlackHole not detected'}
        </p>

        <button onClick={onRerunSetup}>Re-run audio setup</button>
      </section>

      <section>
        <h3>Account</h3>
        <p>{user?.email}</p>
        <button onClick={signOut}>Sign Out</button>
      </section>
    </div>
  )
}
