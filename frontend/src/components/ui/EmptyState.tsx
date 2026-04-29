import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

export interface EmptyStateProps {
  /** Optional decorative icon/illustration above the title. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Convenience: pass label + onClick for a primary CTA. */
  actionLabel?: string;
  onAction?: () => void;
  /** Override slot for a fully custom action area. Wins over actionLabel. */
  action?: ReactNode;
  /** Additional Button props applied when using actionLabel. */
  actionProps?: Omit<ButtonProps, 'children' | 'onClick'>;
  className?: string;
}

/**
 * EmptyState (Phase 8.1).
 *
 * Used wherever a list / table / panel renders zero items. Centered,
 * one-line title, optional description, optional primary CTA. Always
 * give an explicit way forward — empty states without a CTA feel
 * like dead ends.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  actionProps,
  className,
}: EmptyStateProps) {
  const renderedAction =
    action ??
    (actionLabel && onAction ? (
      <Button onClick={onAction} {...actionProps}>
        {actionLabel}
      </Button>
    ) : null);

  return (
    <div
      data-testid="empty-state"
      className={[
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? <div className="text-text-tertiary">{icon}</div> : null}
      <p className="text-[18px] font-medium leading-7 text-text-primary">{title}</p>
      {description ? (
        <p className="max-w-[60ch] text-[14px] text-text-secondary">{description}</p>
      ) : null}
      {renderedAction ? <div className="mt-2">{renderedAction}</div> : null}
    </div>
  );
}
