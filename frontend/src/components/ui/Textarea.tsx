import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string | null;
  helpText?: ReactNode;
  /** When set, renders a "120 / 4000" character count under the input. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, helpText, showCount, id, value, maxLength, className, ...rest },
  ref,
) {
  const auto = useId();
  const ta = id ?? auto;
  const errorId = error ? `${ta}-error` : undefined;
  const helpId = helpText ? `${ta}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
  const len = typeof value === 'string' ? value.length : 0;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={ta} className="text-[14px] font-medium text-text-primary">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={ta}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid="textarea"
        className={[
          'min-h-[80px] w-full resize-y rounded-md border bg-bg-tertiary px-3 py-2 text-[14px] text-text-primary placeholder:text-text-tertiary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          error
            ? 'border-danger focus-visible:border-danger focus-visible:ring-danger'
            : 'border-border-secondary focus-visible:border-border-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      <div className="flex items-baseline justify-between gap-2">
        {error ? (
          <p id={errorId} role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        ) : helpText ? (
          <p id={helpId} className="text-[12px] text-text-tertiary">
            {helpText}
          </p>
        ) : (
          <span />
        )}
        {showCount && maxLength ? (
          <p className="text-[12px] tabular-nums text-text-tertiary">
            {len} / {maxLength}
          </p>
        ) : null}
      </div>
    </div>
  );
});
