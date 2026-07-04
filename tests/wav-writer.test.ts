import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WavWriter } from '../src/main/services/wav-writer'

describe('WavWriter', () => {
  it('writes a valid 16 kHz mono 16-bit WAV with patched sizes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-wav-'))
    const filePath = join(dir, 'audio.wav')
    const writer = await WavWriter.create(filePath, 16000)

    const chunkA = Buffer.alloc(3200) // 100 ms of silence
    const chunkB = Buffer.alloc(1600) // 50 ms
    writer.append(chunkA)
    writer.append(chunkB)
    await writer.close()

    const file = readFileSync(filePath)
    expect(file.length).toBe(44 + 4800)
    expect(file.toString('ascii', 0, 4)).toBe('RIFF')
    expect(file.readUInt32LE(4)).toBe(36 + 4800) // RIFF chunk size
    expect(file.toString('ascii', 8, 12)).toBe('WAVE')
    expect(file.readUInt32LE(24)).toBe(16000) // sample rate
    expect(file.readUInt16LE(22)).toBe(1) // mono
    expect(file.readUInt16LE(34)).toBe(16) // bits per sample
    expect(file.readUInt32LE(40)).toBe(4800) // data chunk size
  })
})
