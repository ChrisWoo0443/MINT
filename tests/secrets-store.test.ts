import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SecretsStore, type SecretsCrypto } from '../src/main/services/secrets-store'

const fakeCrypto: SecretsCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`, 'utf-8'),
  decryptString: (buffer) => buffer.toString('utf-8').replace(/^enc:/, '')
}

describe('SecretsStore', () => {
  it('round-trips a secret through set/get', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-secrets-'))
    const store = new SecretsStore(dir, fakeCrypto)
    store.set('deepgramApiKey', 'dg-test-key')
    expect(store.get('deepgramApiKey')).toBe('dg-test-key')
    expect(store.has('deepgramApiKey')).toBe(true)
    expect(store.has('openaiApiKey')).toBe(false)
  })

  it('never writes plaintext to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-secrets-'))
    const store = new SecretsStore(dir, fakeCrypto)
    store.set('openaiApiKey', 'sk-super-secret')
    const raw = readFileSync(join(dir, 'secrets.json'), 'utf-8')
    expect(raw).not.toContain('sk-super-secret')
  })

  it('persists across instances and clears on empty set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-secrets-'))
    new SecretsStore(dir, fakeCrypto).set('deepgramApiKey', 'dg-key')
    const reloaded = new SecretsStore(dir, fakeCrypto)
    expect(reloaded.get('deepgramApiKey')).toBe('dg-key')
    reloaded.set('deepgramApiKey', '')
    expect(new SecretsStore(dir, fakeCrypto).has('deepgramApiKey')).toBe(false)
  })

  it('treats a corrupt file as empty without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-secrets-'))
    const store = new SecretsStore(dir, fakeCrypto)
    store.set('deepgramApiKey', 'dg-key')
    writeFileSync(join(dir, 'secrets.json'), '{not json')
    expect(new SecretsStore(dir, fakeCrypto).get('deepgramApiKey')).toBe(null)
  })
})
