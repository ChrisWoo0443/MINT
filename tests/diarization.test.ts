import { describe, it, expect } from 'vitest'
import { relabelEntries, type DiarizationTurn } from '../src/main/services/diarization'
import type { TranscriptEntry } from '../src/main/services/local-storage'

const turns: DiarizationTurn[] = [
  { start: 0, end: 14.2, speaker: 0 },
  { start: 14.2, end: 19.8, speaker: 1 }
]

function entry(speaker: string, timestampStart: number): TranscriptEntry {
  return { speaker, content: 'x', timestampStart, timestampEnd: timestampStart + 1 }
}

describe('relabelEntries', () => {
  it('relabels target entries by which turn contains their start time', () => {
    const result = relabelEntries(
      [entry('Meeting Users', 3), entry('Meeting Users', 15)],
      turns,
      'Meeting Users'
    )
    expect(result[0].speaker).toBe('Speaker 1')
    expect(result[1].speaker).toBe('Speaker 2')
  })

  it('never touches non-target entries and keeps label when no turn matches', () => {
    const result = relabelEntries(
      [entry('Chris', 3), entry('Meeting Users', 500)],
      turns,
      'Meeting Users'
    )
    expect(result[0].speaker).toBe('Chris')
    expect(result[1].speaker).toBe('Meeting Users')
  })

  it('assigns an entry in a gap between turns to the nearest turn within 2s', () => {
    const gappy: DiarizationTurn[] = [
      { start: 0, end: 10, speaker: 0 },
      { start: 12, end: 20, speaker: 1 }
    ]
    const result = relabelEntries([entry('Meeting Users', 10.5)], gappy, 'Meeting Users')
    expect(result[0].speaker).toBe('Speaker 1')
  })
})
