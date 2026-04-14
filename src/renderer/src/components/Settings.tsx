import { useCallback, useEffect, useState } from 'react'

interface TagDefinition {
  id: string
  name: string
  color: string
}

interface SettingsProps {
  onRerunOnboarding: () => void
  onResetApp: () => void
}

type WhisperModelName = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en'
type WhisperModelStatus = 'not-downloaded' | 'downloading' | 'ready'

export function Settings({ onRerunOnboarding, onResetApp }: SettingsProps): React.JSX.Element {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>(
    () => localStorage.getItem('micDeviceId') || ''
  )
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('displayName') || '')
  const [storagePath, setStoragePath] = useState('')
  const [deepgramKey, setDeepgramKey] = useState(() => localStorage.getItem('deepgramApiKey') || '')
  const [transcriptionProvider, setTranscriptionProvider] = useState<'local' | 'deepgram'>(
    () => (localStorage.getItem('transcriptionProvider') as 'local' | 'deepgram') || 'local'
  )
  const [whisperModel, setWhisperModel] = useState<WhisperModelName>(
    () => (localStorage.getItem('whisperModel') as WhisperModelName) || 'small.en'
  )
  const [whisperStatus, setWhisperStatus] = useState<WhisperModelStatus>('not-downloaded')
  const [whisperDownloadPct, setWhisperDownloadPct] = useState<number | null>(null)
  const [notesProvider, setNotesProvider] = useState<'openai' | 'ollama'>(
    () => (localStorage.getItem('notesProvider') as 'openai' | 'ollama') || 'openai'
  )
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('openaiApiKey') || '')
  const [ollamaUrl, setOllamaUrl] = useState(
    () => localStorage.getItem('ollamaUrl') || 'http://localhost:11434'
  )
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('ollamaModel') || '')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [customPrompt, setCustomPrompt] = useState(
    () => localStorage.getItem('notesCustomPrompt') || ''
  )

  const loadDevices = useCallback(async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((d) => d.kind === 'audioinput')
    setAudioDevices(audioInputs)
    if (audioInputs.length > 0 && !selectedDevice) {
      setSelectedDevice(audioInputs[0].deviceId)
    }
  }, [selectedDevice])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDevices()
    window.mintAPI.getStoragePath().then(setStoragePath)
    window.mintAPI.getTags().then(setTags)
  }, [loadDevices])

  const loadOllamaModels = useCallback(
    async (url: string): Promise<void> => {
      setOllamaStatus('loading')
      const models = await window.mintAPI.listOllamaModels(url)
      if (models === null) {
        setOllamaModels([])
        setOllamaStatus('error')
        return
      }
      setOllamaModels(models)
      setOllamaStatus('idle')
      if (models.length > 0 && !ollamaModel) {
        setOllamaModel(models[0])
        localStorage.setItem('ollamaModel', models[0])
      }
    },
    [ollamaModel]
  )

  useEffect(() => {
    if (notesProvider === 'ollama') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadOllamaModels(ollamaUrl)
    }
  }, [notesProvider, ollamaUrl, loadOllamaModels])

  useEffect(() => {
    window.mintAPI.whisper.getModelStatus(whisperModel).then(setWhisperStatus)
  }, [whisperModel])

  useEffect(() => {
    const unsubscribe = window.mintAPI.whisper.onDownloadProgress((progress) => {
      if (progress.name !== whisperModel) return
      if (progress.bytesTotal > 0) {
        setWhisperDownloadPct(Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100))
      }
    })
    return unsubscribe
  }, [whisperModel])

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

  const handleTagRename = async (tagId: string, newName: string): Promise<void> => {
    const updatedTags = tags.map((t) => (t.id === tagId ? { ...t, name: newName } : t))
    setTags(updatedTags)
    await window.mintAPI.saveTags(updatedTags)
  }

  const handleDownloadWhisperModel = async (): Promise<void> => {
    setWhisperStatus('downloading')
    setWhisperDownloadPct(0)
    try {
      await window.mintAPI.whisper.downloadModel(whisperModel)
      setWhisperStatus('ready')
    } catch (error) {
      console.error('[MINT] Whisper download failed:', error)
      setWhisperStatus('not-downloaded')
    } finally {
      setWhisperDownloadPct(null)
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
        <h3>Transcription</h3>
        <label htmlFor="transcription-provider">Provider</label>
        <select
          id="transcription-provider"
          value={transcriptionProvider}
          onChange={(e) => {
            const value = e.target.value as 'local' | 'deepgram'
            setTranscriptionProvider(value)
            localStorage.setItem('transcriptionProvider', value)
          }}
        >
          <option value="local">Local (Private)</option>
          <option value="deepgram">Deepgram (Cloud)</option>
        </select>

        {transcriptionProvider === 'local' && (
          <>
            <label htmlFor="whisper-model">Model</label>
            <select
              id="whisper-model"
              value={whisperModel}
              onChange={(e) => {
                const value = e.target.value as WhisperModelName
                setWhisperModel(value)
                localStorage.setItem('whisperModel', value)
              }}
            >
              <option value="tiny.en">tiny.en (75 MB)</option>
              <option value="base.en">base.en (142 MB)</option>
              <option value="small.en">small.en (466 MB) — recommended</option>
              <option value="medium.en">medium.en (1.5 GB)</option>
            </select>
            <div className="whisper-status">
              {whisperStatus === 'ready' && <span>Ready</span>}
              {whisperStatus === 'not-downloaded' && (
                <button type="button" onClick={handleDownloadWhisperModel}>
                  Download
                </button>
              )}
              {whisperStatus === 'downloading' && (
                <span>
                  Downloading {whisperDownloadPct !== null ? `${whisperDownloadPct}%` : ''}
                </span>
              )}
            </div>
          </>
        )}

        {transcriptionProvider === 'deepgram' && (
          <>
            <label htmlFor="deepgram-key">Deepgram API Key</label>
            <input
              id="deepgram-key"
              type="password"
              value={deepgramKey}
              onChange={(e) => {
                setDeepgramKey(e.target.value)
                localStorage.setItem('deepgramApiKey', e.target.value)
              }}
              placeholder="Enter Deepgram API key"
            />
          </>
        )}
      </section>

      <section>
        <h3>Notes Generation</h3>
        <label htmlFor="notes-provider">Provider</label>
        <select
          id="notes-provider"
          value={notesProvider}
          onChange={(e) => {
            const value = e.target.value as 'openai' | 'ollama'
            setNotesProvider(value)
            localStorage.setItem('notesProvider', value)
          }}
        >
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama (Local)</option>
        </select>

        {notesProvider === 'openai' && (
          <>
            <label htmlFor="openai-key">OpenAI API Key</label>
            <input
              id="openai-key"
              type="password"
              value={openaiKey}
              onChange={(e) => {
                setOpenaiKey(e.target.value)
                localStorage.setItem('openaiApiKey', e.target.value)
              }}
              placeholder="Enter OpenAI API key"
            />
          </>
        )}

        {notesProvider === 'ollama' && (
          <>
            <label htmlFor="ollama-url">Ollama URL</label>
            <input
              id="ollama-url"
              type="text"
              value={ollamaUrl}
              onChange={(e) => {
                setOllamaUrl(e.target.value)
                localStorage.setItem('ollamaUrl', e.target.value)
              }}
              placeholder="http://localhost:11434"
            />
            <label htmlFor="ollama-model">Model</label>
            {ollamaStatus === 'loading' ? (
              <p className="settings-hint">Loading models...</p>
            ) : ollamaStatus === 'error' ? (
              <p className="settings-hint" style={{ color: 'var(--color-danger)' }}>
                Could not connect to Ollama. Make sure it is running.
              </p>
            ) : ollamaModels.length === 0 ? (
              <p className="settings-hint">No models found. Pull a model with `ollama pull`.</p>
            ) : (
              <select
                id="ollama-model"
                value={ollamaModel}
                onChange={(e) => {
                  setOllamaModel(e.target.value)
                  localStorage.setItem('ollamaModel', e.target.value)
                }}
              >
                {ollamaModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </section>

      <section>
        <h3>Notes Style</h3>
        <label htmlFor="custom-prompt">Custom Instructions</label>
        <textarea
          id="custom-prompt"
          className="custom-prompt-textarea"
          value={customPrompt}
          onChange={(e) => {
            setCustomPrompt(e.target.value)
            localStorage.setItem('notesCustomPrompt', e.target.value)
          }}
          placeholder="e.g., Focus on technical decisions and code changes. Extract specific deadlines mentioned."
          rows={4}
        />
        <p className="settings-hint">
          These instructions guide how meeting notes are generated. Leave empty for default
          behavior.
        </p>
      </section>

      <section>
        <h3>Tags</h3>
        <div className="tags-settings-list">
          {tags.map((tag) => (
            <div key={tag.id} className="tag-setting-row">
              <span className="tag-dot-large" style={{ background: tag.color }} />
              <input
                type="text"
                value={tag.name}
                onChange={(e) => handleTagRename(tag.id, e.target.value)}
              />
            </div>
          ))}
        </div>
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

      <section>
        <h3>Reset</h3>
        <button onClick={onRerunOnboarding}>Re-run Onboarding</button>
        <button
          className="danger-button"
          onClick={() => {
            if (window.confirm('Reset all settings? API keys and preferences will be cleared.')) {
              onResetApp()
            }
          }}
        >
          Reset All Settings
        </button>
      </section>
    </div>
  )
}
