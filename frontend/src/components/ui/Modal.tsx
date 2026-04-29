import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Footer node OR an array of action buttons (right-aligned). */
  footer?: ReactNode;
  size?: ModalSize;
  /** When false, clicking the backdrop does NOT close the modal. */
  dismissOnBackdrop?: boolean;
  /** When false, the close ✕ button in the header is hidden. */
  showCloseButton?: boolean;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[800px]',
};

/**
 * Modal (Phase 8.1).
 *
 * Dialog with backdrop. Closes on Escape and (optionally) backdrop
 * click. Returns focus to the previously-focused element on close.
 * Use Modal.Footer for the action row, or pass any node via `footer`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
  showCloseButton = true,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management + Esc-to-close.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the dialog itself so the screen reader announces the title.
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      data-testid="modal-backdrop"
      onClick={dismissOnBackdrop ? onClose : undefined}
      className="fixed inset-0 z-40 flex items-center justify-center bg-text-primary/40 px-4 animate-in fade-in duration-fast"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal"
        className={[
          'flex w-full flex-col rounded-lg border border-border-primary bg-bg-primary shadow-lg',
          SIZE_CLASSES[size],
          'max-h-[calc(100vh-32px)]',
        ].join(' ')}
      >
        {title || showCloseButton ? (
          <header className="flex items-start justify-between gap-4 border-b border-border-primary px-6 py-4">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="text-[18px] font-medium leading-7 text-text-primary">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-[13px] text-text-secondary">{description}</p>
              ) : null}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                data-testid="modal-close"
                className="rounded-md p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6 6L14 14M14 6L6 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-border-primary px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Convenience: a confirm-style action row to drop into `footer`.
 * Renders a secondary "Cancel" + a primary action button.
 */
Modal.Footer = function ModalFooter({
  onCancel,
  cancelLabel = 'Cancel',
  primaryLabel,
  onPrimary,
  primaryVariant = 'primary',
  primaryLoading = false,
  primaryDisabled = false,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryVariant?: 'primary' | 'danger';
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
}) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel} type="button">
        {cancelLabel}
      </Button>
      <Button
        variant={primaryVariant}
        onClick={onPrimary}
        loading={primaryLoading}
        disabled={primaryDisabled}
        type="button"
      >
        {primaryLabel}
      </Button>
    </>
  );
};
