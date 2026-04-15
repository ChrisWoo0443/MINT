export interface UpdateInfo {
  version: string
  releaseName: string
  releaseUrl: string
  downloadUrl: string
  releaseNotes: string
}

const VERSION_REGEX = /^v?(\d+)\.(\d+)\.(\d+)$/

function parseVersionTuple(version: string): [number, number, number] {
  const match = VERSION_REGEX.exec(version)
  if (!match) {
    throw new Error(`Malformed version: ${version}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [aMajor, aMinor, aPatch] = parseVersionTuple(a)
  const [bMajor, bMinor, bPatch] = parseVersionTuple(b)
  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1
  return 0
}

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubReleaseResponse {
  tag_name: string
  name: string
  body: string | null
  html_url: string
  assets: GitHubReleaseAsset[]
}

export function parseReleaseResponse(raw: unknown): UpdateInfo {
  const release = raw as GitHubReleaseResponse
  const match = VERSION_REGEX.exec(release.tag_name)
  if (!match) {
    throw new Error(`Malformed tag_name: ${release.tag_name}`)
  }
  const version = `${match[1]}.${match[2]}.${match[3]}`
  const assets = release.assets ?? []
  const dmgAsset = assets.find((asset) => asset.name.toLowerCase().endsWith('.dmg'))
  return {
    version,
    releaseName: release.name ?? release.tag_name,
    releaseUrl: release.html_url,
    downloadUrl: dmgAsset ? dmgAsset.browser_download_url : release.html_url,
    releaseNotes: release.body ?? ''
  }
}

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfo; checkedAt: number }
  | { kind: 'error'; message: string; checkedAt: number }
  | { kind: 'disabled' }

export interface UpdateCheckerOptions {
  currentVersion: string
  isPackaged: boolean
  repo?: string
  fetchTimeoutMs?: number
}

const DEFAULT_REPO = 'ChrisWoo0443/MINT'
const DEFAULT_FETCH_TIMEOUT_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_CHECK_DELAY_MS = 10_000

export class UpdateCheckerService {
  private status: UpdateStatus
  private readonly listeners = new Set<(status: UpdateStatus) => void>()
  private readonly currentVersion: string
  private readonly isPackaged: boolean
  private readonly repo: string
  private readonly fetchTimeoutMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private startTimeoutHandle: NodeJS.Timeout | null = null
  private autoCheckEnabled = true
  private inflightCheck: Promise<void> | null = null

  constructor(options: UpdateCheckerOptions) {
    this.currentVersion = options.currentVersion
    this.isPackaged = options.isPackaged
    this.repo = options.repo ?? DEFAULT_REPO
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    this.status = options.isPackaged ? { kind: 'idle' } : { kind: 'disabled' }
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  onStatusChange(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async checkNow(): Promise<void> {
    if (this.inflightCheck) return this.inflightCheck
    if (!this.isPackaged) {
      this.setStatus({ kind: 'disabled' })
      return
    }
    this.inflightCheck = this.runCheck()
    try {
      await this.inflightCheck
    } finally {
      this.inflightCheck = null
    }
  }

  private async runCheck(): Promise<void> {
    this.setStatus({ kind: 'checking' })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs)

    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.repo}/releases/latest`,
        {
          headers: {
            'User-Agent': `MINT-UpdateChecker/${this.currentVersion}`,
            Accept: 'application/vnd.github+json'
          },
          signal: controller.signal
        }
      )
      if (response.status === 404) {
        this.setStatus({ kind: 'up-to-date', checkedAt: Date.now() })
        return
      }
      if (!response.ok) {
        this.setStatus({
          kind: 'error',
          message: `HTTP ${response.status}`,
          checkedAt: Date.now()
        })
        return
      }

      const raw = await response.json()
      let info: UpdateInfo
      try {
        info = parseReleaseResponse(raw)
      } catch (parseError) {
        console.warn('[MINT] Update checker: malformed release, treating as up-to-date:', parseError)
        this.setStatus({ kind: 'up-to-date', checkedAt: Date.now() })
        return
      }

      const comparison = compareVersions(info.version, this.currentVersion)
      if (comparison > 0) {
        this.setStatus({ kind: 'available', info, checkedAt: Date.now() })
      } else {
        this.setStatus({ kind: 'up-to-date', checkedAt: Date.now() })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus({ kind: 'error', message, checkedAt: Date.now() })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  setAutoCheck(enabled: boolean): void {
    this.autoCheckEnabled = enabled
    if (!enabled) {
      this.stopScheduler()
    } else if (this.isPackaged) {
      this.startScheduler()
    }
  }

  start(): void {
    if (!this.isPackaged) return
    if (!this.autoCheckEnabled) return
    if (this.startTimeoutHandle || this.intervalHandle) return
    this.startTimeoutHandle = setTimeout(() => {
      this.startTimeoutHandle = null
      this.checkNow().catch((error) =>
        console.error('[MINT] Update checker initial check failed:', error)
      )
      this.startScheduler()
    }, INITIAL_CHECK_DELAY_MS)
  }

  stop(): void {
    this.stopScheduler()
  }

  private startScheduler(): void {
    if (this.intervalHandle) return
    if (this.startTimeoutHandle) return
    this.intervalHandle = setInterval(() => {
      this.checkNow().catch((error) =>
        console.error('[MINT] Update checker scheduled check failed:', error)
      )
    }, CHECK_INTERVAL_MS)
  }

  private stopScheduler(): void {
    if (this.startTimeoutHandle) {
      clearTimeout(this.startTimeoutHandle)
      this.startTimeoutHandle = null
    }
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private setStatus(next: UpdateStatus): void {
    this.status = next
    for (const listener of this.listeners) {
      try {
        listener(next)
      } catch (error) {
        console.error('[MINT] Update checker listener threw:', error)
      }
    }
  }
}
