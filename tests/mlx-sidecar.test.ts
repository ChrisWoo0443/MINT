import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MlxRequestRouter, MlxSidecarManager } from '../src/main/services/mlx-sidecar'

describe('MlxRequestRouter', () => {
  it('resolves a pending request when its id arrives', async () => {
    const router = new MlxRequestRouter()
    const pending = router.register(1)
    router.handleLine('{"id":1,"words":[{"text":"hi","endMs":500}]}')
    await expect(pending).resolves.toEqual({ id: 1, words: [{ text: 'hi', endMs: 500 }] })
  })

  it('rejects on an error response and ignores unknown ids and garbage', async () => {
    const router = new MlxRequestRouter()
    const pending = router.register(2)
    router.handleLine('not json')
    router.handleLine('{"id":999,"ok":true}')
    router.handleLine('{"id":2,"error":"model not found"}')
    await expect(pending).rejects.toThrow('model not found')
  })

  it('rejects everything pending on shutdown', async () => {
    const router = new MlxRequestRouter()
    const pending = router.register(3)
    router.rejectAll(new Error('sidecar exited'))
    await expect(pending).rejects.toThrow('sidecar exited')
  })
})

describe('MlxSidecarManager', () => {
  it('rejects instead of crashing when the spawned process errors', async () => {
    const venvDir = mkdtempSync(join(tmpdir(), 'mlx-sidecar-test-'))
    mkdirSync(join(venvDir, 'bin'), { recursive: true })
    writeFileSync(join(venvDir, 'bin', 'python'), '')
    writeFileSync(join(venvDir, '.mint-mlx-ok'), '')

    const fakeChild = new EventEmitter() as EventEmitter & {
      stdin: PassThrough
      stdout: PassThrough
      stderr: PassThrough
    }
    fakeChild.stdin = new PassThrough()
    fakeChild.stdout = new PassThrough()
    fakeChild.stderr = new PassThrough()

    const spawnFn = (() => {
      setImmediate(() => fakeChild.emit('error', new Error('spawn ENOENT')))
      return fakeChild
    }) as unknown as typeof import('node:child_process').spawn

    const manager = new MlxSidecarManager({
      venvDir,
      sidecarScript: 'sidecar.py',
      spawnFn
    })

    await expect(manager.ensureEngine('lightning', 'test-model')).rejects.toThrow('spawn ENOENT')
  })
})
