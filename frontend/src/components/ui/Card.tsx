import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header — string or any node. Renders inside a bordered top section. */
  title?: ReactNode;
  /** Right-aligned actions in the header (buttons, links). */
  actions?: ReactNode;
  /** Bumps padding from the default --space-5 to --space-6. */
  spacious?: boolean;
  /** When true, applies a subtle hover shadow — use for clickable cards. */
  interactive?: boolean;
  /** Optional footer — bordered top, same horizontal padding as the body. */
  footer?: ReactNode;
}

export function Card({
  title,
  actions,
  spacious,
  interactive,
  footer,
  children,
  className,
  ...rest
}: CardProps) {
  const padX = spacious ? 'px-6' : 'px-5';
  const padY = spacious ? 'py-5' : 'py-4';
  return (
    <div
      data-testid="card"
      className={[
        'rounded-lg border border-border-primary bg-bg-primary shadow-sm',
        interactive ? 'transition-shadow duration-fast hover:shadow-md cursor-pointer' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {title || actions ? (
        <header
          className={`flex items-baseline justify-between gap-4 border-b border-border-primary ${padX} ${padY}`}
        >
          <div className="min-w-0 flex-1">
            {typeof title === 'string' ? (
              <h3 className="text-[16px] font-medium leading-6 text-text-primary">{title}</h3>
            ) : (
              title
            )}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={`${padX} ${padY}`}>{children}</div>
      {footer ? (
        <footer className={`border-t border-border-primary ${padX} ${padY}`}>{footer}</footer>
      ) : null}
    </div>
  );
}
