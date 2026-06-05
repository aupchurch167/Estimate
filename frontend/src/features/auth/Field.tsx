import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;

  const enhanced = Children.map(children, (child) => {
    if (isValidElement<Record<string, unknown>>(child)) {
      return cloneElement(child, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': errorId,
      });
    }
    return child;
  });

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium text-text-primary"
      >
        {label}
      </label>
      {enhanced}
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-tertiary';
