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
  const dmgAsset = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.dmg'))
  return {
    version,
    releaseName: release.name,
    releaseUrl: release.html_url,
    downloadUrl: dmgAsset ? dmgAsset.browser_download_url : release.html_url,
    releaseNotes: release.body ?? ''
  }
}
