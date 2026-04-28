import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Minimal confirm dialog. Press Escape or click the backdrop to cancel.
 *
 *   <ConfirmDialog
 *     open={open}
 *     title="Remove monthly AI cap?"
 *     body="Without a cap your org can spend any amount on AI runs."
 *     confirmLabel="Remove cap"
 *     onConfirm={...}
 *     onCancel={...}
 *   />
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="font-mono text-[12px] uppercase tracking-title text-ink"
        >
          {title}
        </h2>
        {body ? <div className="mt-3 font-sans text-[13px] text-dim">{body}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition ${
              destructive
                ? 'border-mark-red bg-mark-red text-ink-inverse hover:bg-mark-red/90'
                : 'border-ink bg-ink text-ink-inverse hover:bg-ink/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
