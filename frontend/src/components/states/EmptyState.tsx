import type { ReactNode } from 'react';

/**
 * Drafting-aesthetic empty state (Phase 8.2).
 *
 * One-line guidance + optional CTA. The mono uppercase eyebrow matches
 * the rest of the app's section labels. Supply `actionLabel` +
 * `onAction` (or just `action` for a custom node) to give the user a
 * way forward.
 */

interface EmptyStateProps {
  /** Mono uppercase eyebrow, e.g. "No estimates yet". */
  eyebrow?: string;
  /** Primary headline — keep under ~70 chars. */
  title: string;
  /** Optional one-line subhead. */
  description?: string;
  /** Convenience: pass label + handler for a primary CTA. */
  actionLabel?: string;
  onAction?: () => void;
  /** Override slot for a fully custom action area. Wins over actionLabel. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  action,
  className = '',
}: EmptyStateProps) {
  const renderedAction =
    action ??
    (actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        data-testid="empty-state-action"
        className="mt-4 border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90"
      >
        {actionLabel}
      </button>
    ) : null);

  return (
    <div
      data-testid="empty-state"
      className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}
    >
      {eyebrow ? (
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          {eyebrow}
        </p>
      ) : null}
      <p className="mt-2 max-w-[60ch] font-sans text-[16px] text-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-[60ch] font-sans text-[12px] text-dim">{description}</p>
      ) : null}
      {renderedAction}
    </div>
  );
}
