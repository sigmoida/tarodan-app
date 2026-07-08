'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  /** Rendered when a child throws; `reset` clears the error to retry. */
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Minimal error boundary — pairs with QueryErrorResetBoundary for retry. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.reset);
    return this.props.children;
  }
}
