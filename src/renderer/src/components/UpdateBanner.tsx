import { useEffect, useState } from 'react'

type UpdateInfoPayload = {
  version: string
  releaseUrl: string
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

  const handleViewOnGitHub = async (): Promise<void> => {
    await window.mintAPI.updates.openExternal(status.info.releaseUrl)
  }

  const handleDismiss = (): void => {
    localStorage.setItem('dismissedUpdateVersion', status.info.version)
    setDismissedVersion(status.info.version)
  }

  return (
    <div className="update-banner">
      <span className="update-banner-message">
        Version {status.info.version} is available — run{' '}
        <code>git pull &amp;&amp; npm run build:mac</code> to update
      </span>
      <div className="update-banner-actions">
        <button className="update-banner-primary" onClick={handleViewOnGitHub}>
          View on GitHub
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
