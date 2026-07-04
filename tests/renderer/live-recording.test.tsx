import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import { LiveRecording } from '../../src/renderer/src/components/LiveRecording'
import type { TranscriptChunk } from '../../src/shared/api-types'

describe('LiveRecording transcript rendering', () => {
  let transcriptCallback: (chunk: TranscriptChunk) => void

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    transcriptCallback = () => {}
    window.mintAPI = {
      onTranscriptChunk: vi.fn((callback: (chunk: TranscriptChunk) => void) => {
        transcriptCallback = callback
        return () => {}
      }),
      onRecordingStatus: vi.fn(() => () => {}),
      onTranscriptionDegraded: vi.fn(() => () => {})
    } as unknown as Window['mintAPI']
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const chunk = (overrides: Partial<TranscriptChunk>): TranscriptChunk => ({
    speaker: null,
    content: '',
    timestampStart: 0,
    timestampEnd: 0,
    isFinal: false,
    ...overrides
  })

  it('appends a row for a final chunk', () => {
    const { container } = render(<LiveRecording onStop={vi.fn()} />)

    act(() => {
      transcriptCallback(chunk({ speaker: 'A', content: 'hello there', isFinal: true }))
    })

    const rows = container.querySelectorAll('.transcript-entry')
    expect(rows.length).toBe(1)
    expect(rows[0].classList.contains('interim')).toBe(false)
    expect(rows[0].textContent).toContain('hello there')
  })

  it('replaces a speaker interim without touching another speaker final row', () => {
    const { container } = render(<LiveRecording onStop={vi.fn()} />)

    act(() => {
      transcriptCallback(chunk({ speaker: 'A', content: 'A final line', isFinal: true }))
    })
    act(() => {
      transcriptCallback(chunk({ speaker: 'B', content: 'B interim v1', isFinal: false }))
    })
    act(() => {
      transcriptCallback(chunk({ speaker: 'B', content: 'B interim v2', isFinal: false }))
    })

    const rows = container.querySelectorAll('.transcript-entry')
    expect(rows.length).toBe(2)
    expect(rows[0].classList.contains('interim')).toBe(false)
    expect(rows[0].textContent).toContain('A final line')
    expect(rows[1].classList.contains('interim')).toBe(true)
    expect(rows[1].textContent).toContain('B interim v2')
    expect(rows[1].textContent).not.toContain('B interim v1')
  })

  it('clears only the arriving speaker interim when that speaker finalizes', () => {
    const { container } = render(<LiveRecording onStop={vi.fn()} />)

    act(() => {
      transcriptCallback(chunk({ speaker: 'A', content: 'A interim', isFinal: false }))
    })
    act(() => {
      transcriptCallback(chunk({ speaker: 'B', content: 'B interim', isFinal: false }))
    })
    act(() => {
      transcriptCallback(chunk({ speaker: 'B', content: 'B final', isFinal: true }))
    })

    const rows = container.querySelectorAll('.transcript-entry')
    expect(rows.length).toBe(2)

    const interimRows = Array.from(rows).filter((row) => row.classList.contains('interim'))
    const finalRows = Array.from(rows).filter((row) => !row.classList.contains('interim'))

    expect(interimRows.length).toBe(1)
    expect(interimRows[0].textContent).toContain('A interim')
    expect(finalRows.length).toBe(1)
    expect(finalRows[0].textContent).toContain('B final')
  })
})
