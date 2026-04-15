import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  compareVersions,
  parseLatestTag,
  UpdateCheckerService,
  type UpdateStatus
} from '../src/main/services/update-checker'

describe('compareVersions', () => {
  it('returns 0 when versions are equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 1 when a has higher major', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
  })

  it('returns -1 when a has lower major', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('compares double-digit minors numerically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  })

  it('tolerates leading v prefix', () => {
    expect(compareVersions('v1.2.0', '1.1.0')).toBe(1)
  })

  it('throws on malformed version', () => {
    expect(() => compareVersions('1.2', '1.2.0')).toThrow()
    expect(() => compareVersions('1.2.0-beta', '1.2.0')).toThrow()
    expect(() => compareVersions('abc', '1.2.0')).toThrow()
  })
})

describe('parseLatestTag', () => {
  const repo = 'ChrisWoo0443/MINT'

  it('extracts highest semver tag from a list', () => {
    const info = parseLatestTag(
      [{ name: 'v1.0.0' }, { name: 'v1.2.0' }, { name: 'v1.1.0' }],
      repo
    )
    expect(info.version).toBe('1.2.0')
    expect(info.releaseUrl).toBe('https://github.com/ChrisWoo0443/MINT/tree/v1.2.0')
  })

  it('ignores non-semver tags', () => {
    const info = parseLatestTag(
      [{ name: 'nightly' }, { name: 'v1.0.0-beta' }, { name: 'v1.0.0' }],
      repo
    )
    expect(info.version).toBe('1.0.0')
  })

  it('handles tags without v prefix', () => {
    const info = parseLatestTag([{ name: '1.2.3' }], repo)
    expect(info.version).toBe('1.2.3')
    expect(info.releaseUrl).toBe('https://github.com/ChrisWoo0443/MINT/tree/1.2.3')
  })

  it('throws when list is empty', () => {
    expect(() => parseLatestTag([], repo)).toThrow()
  })

  it('throws when no valid semver tags present', () => {
    expect(() => parseLatestTag([{ name: 'nightly' }, { name: 'foo' }], repo)).toThrow()
  })

  it('throws when input is not an array', () => {
    expect(() => parseLatestTag({ not: 'an array' }, repo)).toThrow()
  })
})

describe('UpdateCheckerService', () => {
  const currentVersion = '1.1.0'
  const repo = 'ChrisWoo0443/MINT'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeTags(...versions: string[]): Array<{ name: string }> {
    return versions.map((v) => ({ name: `v${v}` }))
  }

  it('starts in idle state when packaged', () => {
    const service = new UpdateCheckerService({ currentVersion, isPackaged: true })
    expect(service.getStatus().kind).toBe('idle')
  })

  it('reports disabled when not packaged', async () => {
    const service = new UpdateCheckerService({ currentVersion, isPackaged: false })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('disabled')
  })

  it('transitions idle to checking to available for a newer tag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTags('1.2.0', '1.1.0', '1.0.0')
    })
    vi.stubGlobal('fetch', fetchMock)

    const states: string[] = []
    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    service.onStatusChange((s: UpdateStatus) => states.push(s.kind))
    await service.checkNow()

    expect(states).toEqual(['checking', 'available'])
    const status = service.getStatus()
    expect(status.kind).toBe('available')
    if (status.kind === 'available') {
      expect(status.info.version).toBe('1.2.0')
      expect(status.info.releaseUrl).toBe('https://github.com/ChrisWoo0443/MINT/tree/v1.2.0')
    }
  })

  it('transitions to up-to-date when latest tag equals current', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTags(currentVersion, '1.0.0')
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('up-to-date')
  })

  it('transitions to up-to-date when latest tag is older than current', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTags('1.0.0')
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('up-to-date')
  })

  it('transitions to error on HTTP 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('error')
  })

  it('transitions to up-to-date on HTTP 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('up-to-date')
  })

  it('transitions to error when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('error')
  })

  it('stays up-to-date when tag list is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => []
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('up-to-date')
  })

  it('stays up-to-date when no tags are valid semver', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'nightly' }, { name: 'preview' }]
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    await service.checkNow()
    expect(service.getStatus().kind).toBe('up-to-date')
  })

  it('unsubscribe stops receiving status changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTags('1.2.0')
    })
    vi.stubGlobal('fetch', fetchMock)

    const received: string[] = []
    const service = new UpdateCheckerService({ currentVersion, isPackaged: true, repo })
    const unsubscribe = service.onStatusChange((s) => received.push(s.kind))
    unsubscribe()
    await service.checkNow()
    expect(received).toEqual([])
  })
})
