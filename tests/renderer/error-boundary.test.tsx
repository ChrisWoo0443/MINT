import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ErrorBoundary } from '../../src/renderer/src/components/ErrorBoundary'

function Bomb(): React.JSX.Element {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a fallback with the error message instead of a blank screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText(/kaboom/)).toBeTruthy()
  })

  it('recovers when Try again is clicked and children no longer throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let shouldThrow = true
    function Sometimes(): React.JSX.Element {
      if (shouldThrow) throw new Error('kaboom')
      return <p>recovered content</p>
    }
    render(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>
    )
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('recovered content')).toBeTruthy()
  })
})
