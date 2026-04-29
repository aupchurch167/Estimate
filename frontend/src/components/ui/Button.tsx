import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-text-inverse border border-primary hover:bg-primary-hover hover:border-primary-hover',
  secondary:
    'bg-bg-primary text-text-primary border border-border-secondary hover:bg-bg-tertiary',
  danger:
    'bg-danger text-text-inverse border border-danger hover:bg-danger/90 hover:border-danger/90',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-bg-tertiary hover:text-text-primary',
  link:
    'bg-transparent text-primary border border-transparent hover:underline px-0',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-[12px]',
  md: 'h-9 px-4 text-[14px]',
  lg: 'h-11 px-6 text-[16px]',
};

/**
 * Button (Phase 8.1).
 *
 * The single source of truth for any clickable action across the app.
 * Variants map to the design spec — primary (filled blue), secondary
 * (outlined), danger (filled red), ghost (no chrome), link (text-only).
 *
 * `loading` swaps the label for a spinner without resizing the button
 * so layout doesn't shift mid-submit.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    children,
    type,
    className,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={isDisabled}
      data-variant={variant}
      data-size={size}
      data-loading={loading ? 'true' : undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : leftIcon ? (
        <span className="flex items-center">{leftIcon}</span>
      ) : null}
      {children}
      {!loading && rightIcon ? <span className="flex items-center">{rightIcon}</span> : null}
    </button>
  );
});

function Spinner() {
  return (
    <span
      data-testid="button-spinner"
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
