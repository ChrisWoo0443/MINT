import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[MINT] Renderer crashed:', error)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h2>Something went wrong</h2>
          <p className="error-boundary-message">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}
