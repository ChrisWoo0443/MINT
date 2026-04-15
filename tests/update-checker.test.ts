import { describe, it, expect } from 'vitest'
import {
  compareVersions,
  parseReleaseResponse
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

describe('parseReleaseResponse', () => {
  const fixture = {
    tag_name: 'v1.2.0',
    name: 'v1.2.0 notes',
    body: 'Release notes body',
    html_url: 'https://github.com/ChrisWoo0443/MINT/releases/tag/v1.2.0',
    assets: [
      {
        name: 'mint-1.2.0.dmg',
        browser_download_url:
          'https://github.com/ChrisWoo0443/MINT/releases/download/v1.2.0/mint-1.2.0.dmg'
      },
      {
        name: 'checksum.txt',
        browser_download_url:
          'https://github.com/ChrisWoo0443/MINT/releases/download/v1.2.0/checksum.txt'
      }
    ]
  }

  it('extracts version, urls, release notes from a well-formed response', () => {
    const info = parseReleaseResponse(fixture)
    expect(info.version).toBe('1.2.0')
    expect(info.releaseName).toBe('v1.2.0 notes')
    expect(info.releaseUrl).toBe(
      'https://github.com/ChrisWoo0443/MINT/releases/tag/v1.2.0'
    )
    expect(info.downloadUrl).toBe(
      'https://github.com/ChrisWoo0443/MINT/releases/download/v1.2.0/mint-1.2.0.dmg'
    )
    expect(info.releaseNotes).toBe('Release notes body')
  })

  it('falls back to html_url when no .dmg asset is present', () => {
    const noDmg = { ...fixture, assets: [fixture.assets[1]] }
    const info = parseReleaseResponse(noDmg)
    expect(info.downloadUrl).toBe(fixture.html_url)
  })

  it('throws when tag_name is malformed', () => {
    expect(() => parseReleaseResponse({ ...fixture, tag_name: 'v1.2.0-beta.1' })).toThrow()
    expect(() => parseReleaseResponse({ ...fixture, tag_name: 'v1.2' })).toThrow()
  })

  it('tolerates empty body', () => {
    const info = parseReleaseResponse({ ...fixture, body: null })
    expect(info.releaseNotes).toBe('')
  })
})
