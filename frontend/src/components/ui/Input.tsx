import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Always rendered above the input — never use placeholder as a label. */
  label?: ReactNode;
  /** Error message rendered below the input in danger color. Sets aria-invalid + aria-describedby. */
  error?: string | null;
  /** Optional help text below the input (when no error). */
  helpText?: ReactNode;
  /** Forces the visual required asterisk; the underlying `required` attr drives validation. */
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helpText, required, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const errorId = error ? `${inputId}-error` : undefined;
  const helpId = helpText ? `${inputId}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-[14px] font-medium text-text-primary">
          {label}
          {required ? <span className="ml-1 text-danger">*</span> : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid="input"
        className={[
          'h-9 w-full rounded-md border bg-bg-tertiary px-3 text-[14px] text-text-primary placeholder:text-text-tertiary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-0',
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
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-[12px] text-text-tertiary">
          {helpText}
        </p>
      ) : null}
    </div>
  );
});
