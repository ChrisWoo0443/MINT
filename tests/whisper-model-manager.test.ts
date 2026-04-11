import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WhisperModelManager,
  WHISPER_MODELS,
  type ModelName
} from '../src/main/services/whisper-model-manager'

describe('WhisperModelManager', () => {
  let tempDir: string
  let manager: WhisperModelManager

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mint-whisper-test-'))
    manager = new WhisperModelManager(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists all 4 supported models with metadata', async () => {
    const models = await manager.listModels()
    expect(models).toHaveLength(4)
    const names = models.map((m) => m.name).sort()
    expect(names).toEqual(['base.en', 'medium.en', 'small.en', 'tiny.en'])
    for (const model of models) {
      expect(model.sizeMB).toBeGreaterThan(0)
      expect(model.downloaded).toBe(false)
    }
  })

  it('reports a model as downloaded when the file exists', async () => {
    const modelName: ModelName = 'tiny.en'
    writeFileSync(join(tempDir, 'ggml-tiny.en.bin'), Buffer.alloc(100))
    const status = await manager.getModelStatus(modelName)
    expect(status).toBe('ready')
  })

  it('reports not-downloaded when the file does not exist', async () => {
    const status = await manager.getModelStatus('tiny.en')
    expect(status).toBe('not-downloaded')
  })

  it('writes downloaded bytes to a .tmp file then renames on success', async () => {
    const fakeBody = Buffer.from('fake model bytes')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-length', String(fakeBody.length)]]),
      body: {
        getReader() {
          let yielded = false
          return {
            async read() {
              if (yielded) return { done: true, value: undefined }
              yielded = true
              return { done: false, value: fakeBody }
            }
          }
        }
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    await manager.downloadModel('tiny.en', () => {})

    const finalPath = join(tempDir, 'ggml-tiny.en.bin')
    expect(existsSync(finalPath)).toBe(true)
    expect(existsSync(`${finalPath}.tmp`)).toBe(false)

    vi.unstubAllGlobals()
  })

  it('deletes the .tmp file if the download throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(manager.downloadModel('tiny.en', () => {})).rejects.toThrow('network down')

    const finalPath = join(tempDir, 'ggml-tiny.en.bin')
    expect(existsSync(finalPath)).toBe(false)
    expect(existsSync(`${finalPath}.tmp`)).toBe(false)

    vi.unstubAllGlobals()
  })

  it('deduplicates concurrent downloads of the same model', async () => {
    let resolveBody: ((value: Buffer) => void) | null = null
    const bodyPromise = new Promise<Buffer>((resolve) => {
      resolveBody = resolve
    })
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      headers: new Map([['content-length', '16']]),
      body: {
        getReader() {
          let yielded = false
          return {
            async read() {
              if (yielded) return { done: true, value: undefined }
              yielded = true
              const value = await bodyPromise
              return { done: false, value }
            }
          }
        }
      }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const promise1 = manager.downloadModel('tiny.en', () => {})
    const promise2 = manager.downloadModel('tiny.en', () => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveBody!(Buffer.from('fake model bytes'))
    await Promise.all([promise1, promise2])

    vi.unstubAllGlobals()
  })

  it('deletes a downloaded model file', async () => {
    const finalPath = join(tempDir, 'ggml-tiny.en.bin')
    writeFileSync(finalPath, Buffer.alloc(100))
    await manager.deleteModel('tiny.en')
    expect(existsSync(finalPath)).toBe(false)
  })

  it('exports a WHISPER_MODELS constant with all 4 models', () => {
    expect(WHISPER_MODELS).toHaveProperty('tiny.en')
    expect(WHISPER_MODELS).toHaveProperty('base.en')
    expect(WHISPER_MODELS).toHaveProperty('small.en')
    expect(WHISPER_MODELS).toHaveProperty('medium.en')
  })
})
