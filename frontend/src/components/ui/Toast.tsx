import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Toast (Phase 8.1).
 *
 * Singleton ToastProvider mounted near the root of the tree. Anywhere
 * inside, call `useToast()` to push a notification:
 *
 *   const toast = useToast();
 *   toast.success('Saved.');
 *   toast.error('Could not save.', { description: 'Network error' });
 *
 * Toasts auto-dismiss after 4 seconds. Stack bottom-right on desktop,
 * bottom-center on mobile.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastInput {
  description?: string;
  /** Override auto-dismiss. Pass 0 or null for sticky toasts. */
  durationMs?: number | null;
}

interface ToastEntry extends ToastInput {
  id: number;
  variant: ToastVariant;
  title: string;
  createdAt: number;
}

interface ToastApi {
  success: (title: string, opts?: ToastInput) => void;
  error: (title: string, opts?: ToastInput) => void;
  warning: (title: string, opts?: ToastInput) => void;
  info: (title: string, opts?: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, opts?: ToastInput) => {
      setItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          variant,
          title,
          description: opts?.description,
          durationMs: opts?.durationMs,
          createdAt: Date.now(),
        },
      ]);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, opts) => push('success', title, opts),
      error: (title, opts) => push('error', title, opts),
      warning: (title, opts) => push('warning', title, opts),
      info: (title, opts) => push('info', title, opts),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return ctx;
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      data-testid="toast-viewport"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0"
    >
      {items.map((t) => (
        <ToastItem key={t.id} entry={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
};

const VARIANT_TEXT: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  useEffect(() => {
    if (entry.durationMs === null || entry.durationMs === 0) return undefined;
    const t = setTimeout(onDismiss, entry.durationMs ?? DEFAULT_DURATION_MS);
    return () => clearTimeout(t);
  }, [entry.durationMs, onDismiss]);

  return (
    <div
      role="status"
      data-testid="toast"
      data-variant={entry.variant}
      className={[
        'pointer-events-auto flex w-full max-w-[420px] gap-3 rounded-md border border-l-4 border-border-primary bg-bg-primary px-4 py-3 shadow-md',
        VARIANT_BORDER[entry.variant],
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-medium ${VARIANT_TEXT[entry.variant]}`}>{entry.title}</p>
        {entry.description ? (
          <p className="mt-1 text-[13px] text-text-secondary">{entry.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        data-testid="toast-dismiss"
        className="-mr-1 -mt-1 rounded p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
