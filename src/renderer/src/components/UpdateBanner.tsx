import { useEffect, useState } from 'react'

type UpdateInfoPayload = {
  version: string
  releaseName: string
  releaseUrl: string
  downloadUrl: string
  releaseNotes: string
}

type UpdateStatusPayload =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfoPayload; checkedAt: number }
  | { kind: 'error'; message: string; checkedAt: number }
  | { kind: 'disabled' }

export function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatusPayload>({ kind: 'idle' })
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem('dismissedUpdateVersion')
  )

  useEffect(() => {
    window.mintAPI.updates.getStatus().then(setStatus)
    const unsubscribe = window.mintAPI.updates.onStatus(setStatus)
    return unsubscribe
  }, [])

  if (status.kind !== 'available') return null
  if (dismissedVersion === status.info.version) return null

  const handleDownload = async (): Promise<void> => {
    await window.mintAPI.updates.openExternal(status.info.downloadUrl)
  }

  const handleReleaseNotes = async (): Promise<void> => {
    await window.mintAPI.updates.openExternal(status.info.releaseUrl)
  }

  const handleDismiss = (): void => {
    localStorage.setItem('dismissedUpdateVersion', status.info.version)
    setDismissedVersion(status.info.version)
  }

  return (
    <div className="update-banner">
      <span className="update-banner-message">Version {status.info.version} is available</span>
      <div className="update-banner-actions">
        <button className="update-banner-link" onClick={handleReleaseNotes}>
          Release notes
        </button>
        <button className="update-banner-primary" onClick={handleDownload}>
          Download
        </button>
        <button
          className="update-banner-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss update"
        >
          ×
        </button>
      </div>
    </div>
  )
}
