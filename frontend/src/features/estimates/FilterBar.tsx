import { useDebouncedValue } from '@/features/pricing/usePricing';
import { useEffect, useState } from 'react';
import { ESTIMATE_STATUSES, type EstimateStatus } from './types';
import type { SafeUser } from '@/features/auth/types';

export interface FilterValues {
  status: EstimateStatus[];
  drafterId: string;
  reviewerId: string;
  search: string;
}

interface FilterBarProps {
  value: FilterValues;
  onChange: (next: FilterValues) => void;
  members: SafeUser[];
}

export function FilterBar({ value, onChange, members }: FilterBarProps) {
  // Local state for the search input so debouncing doesn't hammer the URL
  // / query on every keystroke.
  const [searchLocal, setSearchLocal] = useState(value.search);
  const debouncedSearch = useDebouncedValue(searchLocal, 300);

  useEffect(() => {
    if (debouncedSearch !== value.search) {
      onChange({ ...value, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Reflect external search resets back into the local input.
  useEffect(() => {
    setSearchLocal(value.search);
  }, [value.search]);

  const toggleStatus = (s: EstimateStatus) => {
    const has = value.status.includes(s);
    const next = has ? value.status.filter((x) => x !== s) : [...value.status, s];
    onChange({ ...value, status: next });
  };

  return (
    <div className="flex flex-col gap-3 border-b border-rule pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-dim">Status</span>
        {ESTIMATE_STATUSES.map((s) => {
          const selected = value.status.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label transition ${
                selected
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-rule text-dim hover:border-ink hover:text-ink'
              }`}
            >
              {labelOf(s)}
            </button>
          );
        })}
        {value.status.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, status: [] })}
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-dim">Drafter</span>
          <select
            value={value.drafterId}
            onChange={(e) => onChange({ ...value, drafterId: e.target.value })}
            className="border-b border-rule bg-transparent py-1 font-sans text-[13px] outline-none focus:border-ink"
          >
            <option value="">All</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-dim">Reviewer</span>
          <select
            value={value.reviewerId}
            onChange={(e) => onChange({ ...value, reviewerId: e.target.value })}
            className="border-b border-rule bg-transparent py-1 font-sans text-[13px] outline-none focus:border-ink"
          >
            <option value="">All</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="ml-auto flex flex-1 max-w-[420px] items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-dim">Search</span>
          <input
            type="search"
            value={searchLocal}
            onChange={(e) => setSearchLocal(e.target.value)}
            placeholder="Title, client, or estimate number"
            className="w-full border-b border-rule bg-transparent py-1 font-sans text-[13px] outline-none focus:border-ink"
          />
        </label>
      </div>
    </div>
  );
}

function labelOf(s: EstimateStatus): string {
  return s === 'IN_REVIEW' ? 'In Review' : s.charAt(0) + s.slice(1).toLowerCase();
}
