import type { ScopeSection } from '@/features/estimates/types';

interface SectionHeaderProps {
  section: ScopeSection;
  index: number;
  itemCount: number;
  subtotal: number;
  readOnly: boolean;
  onAddLineItem: () => void;
  onDeleteSection: () => void;
}

export function SectionHeader({
  section,
  index,
  itemCount,
  subtotal,
  readOnly,
  onAddLineItem,
  onDeleteSection,
}: SectionHeaderProps) {
  const letter = String.fromCharCode(65 + (index % 26));
  return (
    <tr className="border-b border-rule bg-paper sticky top-0 z-10">
      <td colSpan={11} className="px-2 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {letter} · {section.name}
            <span className="ml-3 text-rule-soft">·</span>
            <span className="ml-2 tabular-nums">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[12px] tabular-nums text-ink">{fmt(subtotal)}</span>
            {!readOnly ? (
              <>
                <button
                  type="button"
                  onClick={onAddLineItem}
                  className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
                >
                  + Line
                </button>
                <button
                  type="button"
                  onClick={onDeleteSection}
                  className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-dim hover:border-mark-red hover:text-mark-red"
                >
                  Delete
                </button>
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
