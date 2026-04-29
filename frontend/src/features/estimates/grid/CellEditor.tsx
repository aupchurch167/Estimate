import { useEffect, useRef, useState } from 'react';

interface CellEditorProps {
  initialValue: string;
  type?: 'text' | 'number';
  align?: 'left' | 'right';
  className?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Inline cell editor — focuses on mount, commits on blur or Enter,
 * cancels on Escape. Number inputs validate ≥ 0.
 */
export function CellEditor({
  initialValue,
  type = 'text',
  align = 'left',
  className = '',
  onCommit,
  onCancel,
}: CellEditorProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    // The bug: previously an empty trimmed value was forwarded to the
    // server, which then 400'd because every Zod field requires either
    // .min(1) (description) or matches a non-empty regex (quantity, costs,
    // markup). Treat "user cleared the cell" as cancel so the row keeps
    // its prior value instead of returning a confusing validation error.
    if (trimmed === '') {
      onCancel();
      return;
    }
    if (type === 'number' && Number.isNaN(Number(trimmed))) {
      onCancel();
      return;
    }
    if (trimmed === initialValue.trim()) {
      onCancel();
      return;
    }
    onCommit(trimmed);
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      className={`w-full border-b border-ink bg-paper px-1 py-0.5 font-mono text-[12px] outline-none ${
        align === 'right' ? 'text-right tabular-nums' : 'text-left'
      } ${className}`}
    />
  );
}

interface SelectEditorProps<T extends string> {
  initialValue: T;
  options: readonly T[];
  onCommit: (value: T) => void;
  onCancel: () => void;
}

export function SelectEditor<T extends string>({
  initialValue,
  options,
  onCommit,
  onCancel,
}: SelectEditorProps<T>) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <select
      ref={ref}
      defaultValue={initialValue}
      onBlur={(e) => {
        const v = e.target.value as T;
        if (v === initialValue) onCancel();
        else onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className="w-full bg-paper py-0.5 font-mono text-[11px] uppercase tracking-label outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
