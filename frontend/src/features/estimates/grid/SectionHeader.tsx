import { useEffect, useRef, useState } from 'react';
import type { ScopeSection } from '@/features/estimates/types';
import { Button } from '@/components/ui';

interface SectionHeaderProps {
  section: ScopeSection;
  index: number;
  itemCount: number;
  subtotal: number;
  readOnly: boolean;
  onAddLineItem: () => void;
  onDeleteSection: () => void;
  onRenameSection?: (name: string) => void;
}

/**
 * Section row in the LineItemGrid (Phase 8.1 layout iteration 3).
 *
 * Section name is click-to-edit when not read-only — Enter commits,
 * Escape cancels, blur commits. Status column was dropped; the row's
 * left border accent indicates status now.
 */
export function SectionHeader({
  section,
  index,
  itemCount,
  subtotal,
  readOnly,
  onAddLineItem,
  onDeleteSection,
  onRenameSection,
}: SectionHeaderProps) {
  const letter = String.fromCharCode(65 + (index % 26));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(section.name);
  }, [section.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === section.name) {
      setDraft(section.name);
      setEditing(false);
      return;
    }
    onRenameSection?.(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(section.name);
    setEditing(false);
  };

  return (
    <tr className="sticky top-0 z-10 border-y border-border-primary bg-bg-secondary">
      <td colSpan={10} className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md bg-primary-light text-[12px] font-semibold text-primary">
              {letter}
            </span>
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancel();
                  }
                }}
                data-testid={`section-${section.id}-name-input`}
                className="h-7 min-w-[180px] rounded-md border border-border-secondary bg-bg-primary px-2 text-[14px] font-medium text-text-primary focus-visible:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            ) : (
              <button
                type="button"
                disabled={readOnly || !onRenameSection}
                onClick={() => setEditing(true)}
                data-testid={`section-${section.id}-name`}
                className="rounded-md px-1 text-left text-[14px] font-medium text-text-primary hover:bg-bg-tertiary disabled:cursor-default disabled:hover:bg-transparent"
                title={readOnly ? '' : 'Click to rename'}
              >
                {section.name}
              </button>
            )}
            <span className="text-[12px] tabular-nums text-text-tertiary">
              · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[14px] font-semibold tabular-nums text-text-primary">
              {fmt(subtotal)}
            </span>
            {!readOnly ? (
              <>
                <Button size="sm" variant="secondary" onClick={onAddLineItem}>
                  + Line
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDeleteSection}
                  className="text-text-tertiary hover:!bg-danger-light hover:!text-danger"
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
