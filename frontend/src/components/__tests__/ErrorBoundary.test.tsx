import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  it('renders the fallback when a child throws and surfaces the error message', () => {
    // React logs the caught error to console.error during the render —
    // suppress so the test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom message="render exploded" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText(/render exploded/i)).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('shows Reload + Try again buttons in the fallback', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('"Try again" resets the boundary state (re-renders children)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    function MaybeBoom(): JSX.Element {
      if (shouldThrow) throw new Error('once');
      return <p data-testid="recovered">ok</p>;
    }
    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    shouldThrow = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('passes children through unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p data-testid="happy">happy path</p>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('happy')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });
});
