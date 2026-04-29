import type { AxiosError } from 'axios';
import { backendErrorMessage } from '@/features/auth/useAuth';

/**
 * Drafting-aesthetic error state (Phase 8.2).
 *
 * Renders a mark-red bordered banner with the error message and an
 * optional Retry button. Pass either `error` (an AxiosError, mapped
 * with `backendErrorMessage`) or a literal `message` string.
 */

interface ErrorStateProps {
  error?: AxiosError | null;
  message?: string;
  /** Fallback text when neither error nor message resolves to anything. */
  fallback?: string;
  /** When provided, renders a Retry button that calls this handler. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  error,
  message,
  fallback = 'Something went wrong.',
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: ErrorStateProps) {
  const text = message ?? (error ? backendErrorMessage(error, fallback) : fallback);
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={`flex flex-col gap-3 border border-mark-red/60 bg-paper-elevated p-4 ${className}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
        Error
      </p>
      <p className="font-sans text-[13px] leading-relaxed text-ink">{text}</p>
      {onRetry ? (
        <div>
          <button
            type="button"
            onClick={onRetry}
            data-testid="error-state-retry"
            className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
