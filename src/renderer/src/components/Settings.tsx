import { useCallback, useEffect, useState } from 'react'

export function Settings(): React.JSX.Element {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>(
    () => localStorage.getItem('micDeviceId') || ''
  )
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('displayName') || '')
  const [storagePath, setStoragePath] = useState('')

  const loadDevices = useCallback(async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((d) => d.kind === 'audioinput')
    setAudioDevices(audioInputs)
    if (audioInputs.length > 0 && !selectedDevice) {
      setSelectedDevice(audioInputs[0].deviceId)
    }
  }, [selectedDevice])

  useEffect(() => {
    loadDevices()
    window.mintAPI.getStoragePath().then(setStoragePath)
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

  const handlePickFolder = async (): Promise<void> => {
    const picked = await window.mintAPI.pickStorageFolder()
    if (picked) {
      setStoragePath(picked)
      await window.mintAPI.setStoragePath(picked)
    }
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
      </section>

      <section>
        <h3>Storage</h3>
        <label>Meetings Folder</label>
        <div className="storage-picker">
          <input type="text" value={storagePath} readOnly />
          <button type="button" onClick={handlePickFolder}>
            Browse
          </button>
        </div>
        <p className="setup-hint">Meeting transcripts and notes are saved here.</p>
      </section>
    </div>
  )
}
