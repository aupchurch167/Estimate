import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string | null;
  helpText?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, helpText, id, children, className, ...rest },
  ref,
) {
  const auto = useId();
  const selectId = id ?? auto;
  const errorId = error ? `${selectId}-error` : undefined;
  const helpId = helpText ? `${selectId}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={selectId} className="text-[14px] font-medium text-text-primary">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid="select"
        className={[
          'h-9 w-full rounded-md border bg-bg-tertiary px-3 pr-8 text-[14px] text-text-primary',
          'appearance-none bg-no-repeat bg-right',
          // Inline SVG caret so we don't need an additional asset.
          // eslint-disable-next-line max-len
          'bg-[url("data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2020%2020%27%20fill=%27%2364748B%27%3e%3cpath%20d=%27M5.293%207.707a1%201%200%20011.414%200L10%2011l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%27/%3e%3c/svg%3e")]',
          'bg-[length:18px_18px] bg-[position:right_8px_center]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          error
            ? 'border-danger focus-visible:border-danger'
            : 'border-border-secondary focus-visible:border-border-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </select>
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
