import type { ReactNode } from 'react';

export interface TitleBlockProps {
  /** Optional icon (lucide-style or inline SVG) shown before the title. */
  icon?: ReactNode;
  title: ReactNode;
  /** Optional one-line subtitle below the title. */
  subtitle?: ReactNode;
  /** Optional breadcrumb above the title; usually a sequence of links. */
  breadcrumb?: ReactNode;
  /** Right-aligned actions: array of buttons or a custom node. */
  actions?: ReactNode;
  /** Optional badge (typically a status pill) rendered next to the title. */
  badge?: ReactNode;
  /** Removes the bottom border. */
  noBorder?: boolean;
  className?: string;
}

/**
 * Top-of-page title block (Phase 8.1).
 *
 * Every page starts with one of these. On desktop, actions sit
 * top-right next to the title. On narrow viewports, actions wrap
 * below the title row and stretch full-width — the typical mobile
 * affordance for a primary CTA.
 */
export function TitleBlock({
  icon,
  title,
  subtitle,
  breadcrumb,
  actions,
  badge,
  noBorder,
  className,
}: TitleBlockProps) {
  return (
    <div
      data-testid="title-block"
      className={[
        'flex flex-col gap-4 pb-5',
        noBorder ? '' : 'border-b border-border-primary',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {breadcrumb ? (
        <div className="text-[13px] text-text-secondary">{breadcrumb}</div>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-primary-light text-primary">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-[24px] font-medium leading-8 text-text-primary">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle ? (
              <p className="mt-1 text-[14px] text-text-secondary">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
