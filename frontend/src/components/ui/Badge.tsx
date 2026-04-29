import type { ReactNode } from 'react';
import type { BadgeVariant } from '@/constants/statusMap';
import { statusVariant } from '@/constants/statusMap';

export type { BadgeVariant };
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BaseBadgeProps {
  size?: BadgeSize;
  /** When true, prepends a small colored dot before the label. */
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pass-through so callers can override the default `badge` test id. */
  'data-testid'?: string;
}

interface ExplicitBadgeProps extends BaseBadgeProps {
  variant: BadgeVariant;
  status?: never;
}

interface StatusBadgeProps extends BaseBadgeProps {
  /** Resolves through statusMap to a variant. Convenient for wiring to backend status strings. */
  status: string | null | undefined;
  variant?: never;
}

export type BadgeProps = ExplicitBadgeProps | StatusBadgeProps;

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  info: 'bg-info-light text-info',
  neutral: 'bg-neutral-light text-neutral',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-5 px-2 text-[11px]',
  md: 'h-6 px-2 text-[12px]',
  lg: 'h-7 px-3 text-[13px]',
};

/**
 * Badge / StatusStamp (Phase 8.1).
 *
 * Universal status pill. Pass `variant` directly OR pass a backend
 * `status` string and the component resolves the right variant via
 * the global status map. The latter is the preferred API for
 * estimate / line-item / AI-run statuses so the same string always
 * renders the same color.
 */
export function Badge(props: BadgeProps) {
  const { size = 'md', dot, icon, children, className } = props;
  const testId = props['data-testid'] ?? 'badge';
  const variant: BadgeVariant =
    'variant' in props && props.variant
      ? props.variant
      : statusVariant('status' in props ? props.status : undefined);

  return (
    <span
      data-testid={testId}
      data-variant={variant}
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-medium leading-none',
        'whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`}
        />
      ) : null}
      {icon ? <span className="flex items-center">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
