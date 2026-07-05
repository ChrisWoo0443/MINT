import { describe, it, expect } from 'vitest'
import { MlxRequestRouter } from '../src/main/services/mlx-sidecar'

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
