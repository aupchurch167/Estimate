import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-label text-dim"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="font-mono text-[10px] uppercase tracking-label text-mark-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full border-b border-rule bg-transparent py-2 font-sans text-[14px] text-ink outline-none transition focus:border-ink';
