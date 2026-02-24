import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function Settings(): React.JSX.Element {
  const { user, signOut } = useAuth()
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((d) => d.kind === 'audioinput')
    setAudioDevices(audioInputs)
    if (audioInputs.length > 0 && !selectedDevice) {
      setSelectedDevice(audioInputs[0].deviceId)
    }
  }

  const handleDeviceChange = async (deviceId: string): Promise<void> => {
    setSelectedDevice(deviceId)
    await window.mintAPI.setAudioDevice(deviceId)
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section>
        <h3>Audio</h3>
        <label htmlFor="audio-device">Input Device</label>
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
      </section>

      <section>
        <h3>Account</h3>
        <p>{user?.email}</p>
        <button onClick={signOut}>Sign Out</button>
      </section>
    </div>
  )
}
