export interface WindowWord {
  text: string
  endMs: number
}

export interface ReconcileState {
  committedText: string
  committedAudioEndMs: number
  previousInterim: WindowWord[] | null
  stabilityCounts: Map<string, number>
}

export interface FinalEmission {
  text: string
  endMs: number
}

export interface ReconcileResult {
  finalEmissions: FinalEmission[]
  interim: { text: string; endMs: number } | null
  newState: ReconcileState
}

const STABILITY_THRESHOLD = 2

/**
 * Reconciles a new window of transcribed words against the prior window's state,
 * promoting words that appeared unchanged in two consecutive windows to "final"
 * emissions and treating the trailing remainder as an interim update.
 *
 * Calling contract: each call's `newWords` must correspond to audio starting AFTER
 * `state.committedAudioEndMs`. Already-committed words must not reappear in
 * `newWords`. Callers enforce this by slicing their audio buffer at
 * `committedAudioEndMs` before running the next inference window. If this
 * precondition is violated, `reconcile` will re-emit the committed prefix.
 *
 * Stability gate: a word is promoted from interim to final only when the new
 * window extends the previous one (i.e. `newWords.length > previous.length`) AND
 * the word appears at the same index with the same text and endMs. Same-length
 * replacements are treated as corrections, not confirmations, so they never
 * commit — preventing premature finalization of a word Whisper is still revising.
 */
export function reconcile(state: ReconcileState, newWords: WindowWord[]): ReconcileResult {
  if (newWords.length === 0) {
    return {
      finalEmissions: [],
      interim: null,
      newState: state
    }
  }

  const previous = state.previousInterim ?? []
  const newStability = new Map<string, number>()

  let stablePrefixLength = 0
  const isExtension = newWords.length > previous.length
  if (isExtension) {
    for (let i = 0; i < previous.length; i++) {
      if (previous[i].text === newWords[i].text && previous[i].endMs === newWords[i].endMs) {
        const key = `${i}:${newWords[i].text}`
        const priorCount = state.stabilityCounts.get(key) ?? 1
        const nextCount = priorCount + 1
        newStability.set(key, nextCount)
        if (nextCount >= STABILITY_THRESHOLD) {
          stablePrefixLength = i + 1
        }
      } else {
        break
      }
    }
  }

  // Seed stability=1 for words past the overlap so the next window can promote them.
  for (let i = 0; i < newWords.length; i++) {
    const key = `${i}:${newWords[i].text}`
    if (!newStability.has(key)) {
      newStability.set(key, 1)
    }
  }

  const finalEmissions: FinalEmission[] = []
  let committedText = state.committedText
  let committedAudioEndMs = state.committedAudioEndMs

  if (stablePrefixLength > 0) {
    const stableWords = newWords.slice(0, stablePrefixLength)
    const emissionText = stableWords.map((w) => w.text).join(' ')
    const emissionEndMs = stableWords[stableWords.length - 1].endMs
    finalEmissions.push({ text: emissionText, endMs: emissionEndMs })
    committedText = committedText ? `${committedText} ${emissionText}` : emissionText
    committedAudioEndMs = emissionEndMs
  }

  const trailingWords = newWords.slice(stablePrefixLength)
  const interim =
    trailingWords.length > 0
      ? {
          text: trailingWords.map((w) => w.text).join(' '),
          endMs: trailingWords[trailingWords.length - 1].endMs
        }
      : null

  return {
    finalEmissions,
    interim,
    newState: {
      committedText,
      committedAudioEndMs,
      previousInterim: newWords,
      stabilityCounts: newStability
    }
  }
}

export interface SilenceOptions {
  thresholdRms: number
  minDurationMs: number
}

export function detectSilence(samples: Int16Array, options: SilenceOptions): boolean {
  const sampleRate = 16000
  const minSamples = Math.floor((options.minDurationMs / 1000) * sampleRate)
  if (samples.length < minSamples) return false

  let sumOfSquares = 0
  for (let i = 0; i < samples.length; i++) {
    const normalized = samples[i] / 32768
    sumOfSquares += normalized * normalized
  }
  const rms = Math.sqrt(sumOfSquares / samples.length)
  return rms < options.thresholdRms
}
