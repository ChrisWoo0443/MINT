import { rename, unlink, stat } from 'node:fs/promises'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'

export type ModelName = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en'
export type ModelStatus = 'not-downloaded' | 'downloading' | 'ready'

export interface ModelInfo {
  name: ModelName
  sizeMB: number
  downloaded: boolean
  path: string
}

export interface DownloadProgress {
  name: ModelName
  bytesDownloaded: number
  bytesTotal: number
}

export const WHISPER_MODELS: Record<ModelName, { sizeMB: number; url: string }> = {
  'tiny.en': {
    sizeMB: 75,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin'
  },
  'base.en': {
    sizeMB: 142,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
  },
  'small.en': {
    sizeMB: 466,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
  },
  'medium.en': {
    sizeMB: 1536,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin'
  }
}

export class WhisperModelManager {
  private readonly modelsDir: string
  private readonly activeDownloads = new Map<ModelName, Promise<void>>()

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir
  }

  getModelPath(name: ModelName): string {
    return join(this.modelsDir, `ggml-${name}.bin`)
  }

  async listModels(): Promise<ModelInfo[]> {
    const results: ModelInfo[] = []
    for (const name of Object.keys(WHISPER_MODELS) as ModelName[]) {
      const path = this.getModelPath(name)
      results.push({
        name,
        sizeMB: WHISPER_MODELS[name].sizeMB,
        downloaded: existsSync(path),
        path
      })
    }
    return results
  }

  async getModelStatus(name: ModelName): Promise<ModelStatus> {
    if (this.activeDownloads.has(name)) return 'downloading'
    const path = this.getModelPath(name)
    try {
      const fileStat = await stat(path)
      if (fileStat.isFile() && fileStat.size > 0) return 'ready'
      return 'not-downloaded'
    } catch {
      return 'not-downloaded'
    }
  }

  async downloadModel(
    name: ModelName,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    const existing = this.activeDownloads.get(name)
    if (existing) return existing

    const downloadPromise = this.performDownload(name, onProgress)
    this.activeDownloads.set(name, downloadPromise)
    try {
      await downloadPromise
    } finally {
      this.activeDownloads.delete(name)
    }
  }

  private async performDownload(
    name: ModelName,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    mkdirSync(this.modelsDir, { recursive: true })
    const finalPath = this.getModelPath(name)
    const tmpPath = `${finalPath}.tmp`
    const url = WHISPER_MODELS[name].url

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`)
      }
      const contentLengthHeader = response.headers.get('content-length')
      const bytesTotal = contentLengthHeader ? Number(contentLengthHeader) : 0

      if (!response.body) {
        throw new Error('Response has no body')
      }

      const writeStream = createWriteStream(tmpPath)
      const reader = response.body.getReader()
      let bytesDownloaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          const chunk = Buffer.from(value)
          const canContinue = writeStream.write(chunk)
          bytesDownloaded += chunk.length
          onProgress({ name, bytesDownloaded, bytesTotal })
          if (!canContinue) {
            await once(writeStream, 'drain')
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((error?: Error | null) => {
          if (error) reject(error)
          else resolve()
        })
      })

      await rename(tmpPath, finalPath)
    } catch (error) {
      try {
        await unlink(tmpPath)
      } catch {
        // ignore cleanup failures
      }
      throw error
    }
  }

  async deleteModel(name: ModelName): Promise<void> {
    const path = this.getModelPath(name)
    try {
      await unlink(path)
    } catch {
      // ignore if file did not exist
    }
  }
}
