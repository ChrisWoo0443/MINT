import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

export type SecretName = 'deepgramApiKey' | 'openaiApiKey'

export interface SecretsCrypto {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

interface SecretsFile {
  version: 1
  // base64-encoded ciphertext per secret name
  secrets: Partial<Record<SecretName, string>>
}

export class SecretsStore {
  private readonly filePath: string
  private cache: Partial<Record<SecretName, string>> = {}

  constructor(
    private readonly dir: string,
    private readonly crypto: SecretsCrypto
  ) {
    this.filePath = join(dir, 'secrets.json')
    this.load()
  }

  private load(): void {
    let parsed: SecretsFile
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as SecretsFile
    } catch {
      return // missing or corrupt file — start empty, don't clobber until next set()
    }
    if (parsed?.version !== 1 || !parsed.secrets || typeof parsed.secrets !== 'object') return
    for (const [name, ciphertextB64] of Object.entries(parsed.secrets)) {
      try {
        this.cache[name as SecretName] = this.crypto.decryptString(
          Buffer.from(ciphertextB64 as string, 'base64')
        )
      } catch {
        // undecryptable entry (e.g. Keychain changed) — skip it
      }
    }
  }

  private persist(): void {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error('OS encryption (Keychain) is unavailable; cannot store API keys')
    }
    const secrets: SecretsFile['secrets'] = {}
    for (const [name, plaintext] of Object.entries(this.cache)) {
      secrets[name as SecretName] = this.crypto.encryptString(plaintext as string).toString('base64')
    }
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify({ version: 1, secrets }, null, 2), 'utf-8')
  }

  get(name: SecretName): string | null {
    return this.cache[name] ?? null
  }

  has(name: SecretName): boolean {
    return Boolean(this.cache[name])
  }

  set(name: SecretName, value: string): void {
    if (value === '') {
      delete this.cache[name]
    } else {
      this.cache[name] = value
    }
    this.persist()
  }
}
