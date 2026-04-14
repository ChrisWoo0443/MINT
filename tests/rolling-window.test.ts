import { describe, it, expect } from 'vitest'
import { reconcile, detectSilence, type ReconcileState } from '../src/main/services/rolling-window'

describe('reconcile', () => {
  it('emits interim for the first window result', () => {
    const state: ReconcileState = {
      committedText: '',
      committedAudioEndMs: 0,
      previousInterim: null,
      stabilityCounts: new Map()
    }
    const newWords = [
      { text: 'hello', endMs: 500 },
      { text: 'world', endMs: 1000 }
    ]
    const result = reconcile(state, newWords)
    expect(result.finalEmissions).toEqual([])
    expect(result.interim).toEqual({ text: 'hello world', endMs: 1000 })
    expect(result.newState.previousInterim).toEqual(newWords)
    expect(result.newState.committedAudioEndMs).toBe(0)
  })

  it('emits final for words stable across two consecutive windows', () => {
    const firstWords = [
      { text: 'hello', endMs: 500 },
      { text: 'world', endMs: 1000 }
    ]
    const stateAfterFirst: ReconcileState = {
      committedText: '',
      committedAudioEndMs: 0,
      previousInterim: firstWords,
      stabilityCounts: new Map([
        ['0:hello', 1],
        ['1:world', 1]
      ])
    }
    const secondWords = [
      { text: 'hello', endMs: 500 },
      { text: 'world', endMs: 1000 },
      { text: 'today', endMs: 1400 }
    ]
    const result = reconcile(stateAfterFirst, secondWords)
    expect(result.finalEmissions).toHaveLength(1)
    expect(result.finalEmissions[0].text).toBe('hello world')
    expect(result.finalEmissions[0].endMs).toBe(1000)
    expect(result.newState.committedAudioEndMs).toBe(1000)
    expect(result.newState.committedText).toBe('hello world')
    expect(result.interim?.text).toBe('today')
  })

  it('does not commit words that changed between windows', () => {
    const stateAfterFirst: ReconcileState = {
      committedText: '',
      committedAudioEndMs: 0,
      previousInterim: [
        { text: 'hello', endMs: 500 },
        { text: 'word', endMs: 1000 }
      ],
      stabilityCounts: new Map([
        ['0:hello', 1],
        ['1:word', 1]
      ])
    }
    const correctedWords = [
      { text: 'hello', endMs: 500 },
      { text: 'world', endMs: 1000 }
    ]
    const result = reconcile(stateAfterFirst, correctedWords)
    expect(result.finalEmissions).toEqual([])
    expect(result.newState.committedAudioEndMs).toBe(0)
  })

  it('appends to existing committedText when emitting additional finals', () => {
    const state: ReconcileState = {
      committedText: 'hello world',
      committedAudioEndMs: 1000,
      previousInterim: [
        { text: 'today', endMs: 1400 },
        { text: 'friend', endMs: 1800 }
      ],
      stabilityCounts: new Map([
        ['0:today', 1],
        ['1:friend', 1]
      ])
    }
    const result = reconcile(state, [
      { text: 'today', endMs: 1400 },
      { text: 'friend', endMs: 1800 },
      { text: 'how', endMs: 2200 }
    ])
    expect(result.finalEmissions).toHaveLength(1)
    expect(result.finalEmissions[0].text).toBe('today friend')
    expect(result.finalEmissions[0].endMs).toBe(1800)
    expect(result.newState.committedText).toBe('hello world today friend')
    expect(result.newState.committedAudioEndMs).toBe(1800)
    expect(result.interim?.text).toBe('how')
  })

  it('returns empty result when newWords is empty', () => {
    const state: ReconcileState = {
      committedText: '',
      committedAudioEndMs: 0,
      previousInterim: null,
      stabilityCounts: new Map()
    }
    const result = reconcile(state, [])
    expect(result.finalEmissions).toEqual([])
    expect(result.interim).toBeNull()
  })
})

describe('detectSilence', () => {
  it('returns true when RMS is below threshold', () => {
    const samples = new Int16Array(16000 * 0.7)
    expect(detectSilence(samples, { thresholdRms: 0.005, minDurationMs: 600 })).toBe(true)
  })

  it('returns false when RMS is above threshold', () => {
    const samples = new Int16Array(16000 * 0.7)
    for (let i = 0; i < samples.length; i++) samples[i] = 5000
    expect(detectSilence(samples, { thresholdRms: 0.005, minDurationMs: 600 })).toBe(false)
  })

  it('returns false when silence duration is shorter than required', () => {
    const samples = new Int16Array(16000 * 0.3)
    expect(detectSilence(samples, { thresholdRms: 0.005, minDurationMs: 600 })).toBe(false)
  })
})
