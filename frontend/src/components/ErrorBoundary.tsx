import { Component, type ReactNode } from 'react';

/**
 * Top-level error boundary. Catches uncaught render errors so a buggy
 * sub-tree doesn't take down the whole app with a blank white screen.
 *
 * Renders a drafting-style fallback card with the error message and a
 * "Reload" button. In development the stack is also surfaced so the
 * source of the crash is one click away.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }): void {
    // The render-time crash is already surfaced in the React DevTools
    // overlay during dev. Log it once so prod consoles still capture it.
    console.error('[ErrorBoundary] caught render error', error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  reload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      const isDev =
        typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
      return (
        <div className="min-h-screen bg-paper">
          <main className="mx-auto max-w-[760px] px-6 py-24">
            <div
              role="alert"
              data-testid="error-boundary-fallback"
              className="border border-mark-red/60 bg-paper-elevated p-8"
            >
              <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
                Something broke
              </p>
              <h1 className="mt-2 font-sans text-[20px] text-ink">
                The page hit an unexpected error.
              </h1>
              <p className="mt-2 max-w-[60ch] font-sans text-[13px] text-dim">
                {this.state.error.message ||
                  'No error message — check the browser console or backend logs for details.'}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={this.reload}
                  className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90"
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={this.reset}
                  className="border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink hover:border-ink"
                >
                  Try again
                </button>
              </div>
              {isDev && this.state.errorInfo?.componentStack ? (
                <pre className="mt-6 max-h-[280px] overflow-auto border border-rule-soft bg-paper p-3 font-mono text-[10px] leading-snug text-dim">
                  {this.state.errorInfo.componentStack.trim()}
                </pre>
              ) : null}
            </div>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}
