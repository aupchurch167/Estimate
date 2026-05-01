import { useEffect, useRef, useState } from 'react';

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ComboboxProps {
  id?: string;
  placeholder?: string;
  error?: string;
  loading?: boolean;
  disabled?: boolean;
  options: ComboboxOption[];
  selectedId: string | null;
  selectedLabel: string;
  onQueryChange: (query: string) => void;
  onSelect: (option: ComboboxOption) => void;
  onClear: () => void;
}

export function Combobox({
  id,
  placeholder,
  error,
  loading,
  disabled,
  options,
  selectedId,
  selectedLabel,
  onQueryChange,
  onSelect,
  onClear,
}: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedId) {
      setQuery(selectedLabel);
    }
  }, [selectedId, selectedLabel]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (selectedId) onClear();
    onQueryChange(val);
    setOpen(true);
  }

  function handleFocus() {
    if (!selectedId) setOpen(true);
  }

  function handleBlur() {
    // Delay so onMouseDown on list items fires first.
    setTimeout(() => setOpen(false), 150);
  }

  function handleSelect(option: ComboboxOption) {
    setQuery(option.label);
    onSelect(option);
    setOpen(false);
  }

  function handleClear() {
    setQuery('');
    onClear();
    onQueryChange('');
    setOpen(false);
    inputRef.current?.focus();
  }

  const showDropdown = open && !selectedId && (options.length > 0 || loading);

  const inputBase =
    'h-9 w-full rounded-md border bg-bg-tertiary px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50';
  const inputBorder = error
    ? 'border-danger focus-visible:border-danger focus-visible:ring-danger'
    : 'border-border-secondary focus-visible:border-border-focus';

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={[inputBase, inputBorder, selectedId ? 'pr-8' : ''].join(' ')}
        />
        {selectedId ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={handleClear}
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border-secondary bg-bg-primary shadow-md"
        >
          {loading ? (
            <li className="px-3 py-2 text-[13px] text-text-tertiary">Searching…</li>
          ) : (
            options.map((option) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === selectedId}
                onMouseDown={() => handleSelect(option)}
                className="flex cursor-pointer flex-col px-3 py-2 hover:bg-bg-secondary"
              >
                <span className="text-[14px] text-text-primary">{option.label}</span>
                {option.sublabel ? (
                  <span className="text-[12px] text-text-tertiary">{option.sublabel}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
