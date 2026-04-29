import { useState } from 'react';
import type { EstimateDetail, LineItem } from '@/features/estimates/types';
import { LineItemEditor } from '@/features/estimates/grid/LineItemEditor';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

/**
 * Schedule rollup, draft-mode flavor.
 *
 * Sections expand to reveal their line items; each line item is a
 * button that opens LineItemEditor (the same modal used in
 * review-mode). The panel is too narrow for inline numeric editing
 * here — every change goes through the modal where there's room
 * for the full field set.
 */
export function SchedulePanel({ estimate }: { estimate: EstimateDetail }) {
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(estimate.scopeSections.map((s) => s.id)),
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const sections = estimate.scopeSections.map((s) => {
    const items = estimate.lineItems
      .filter((li) => li.scopeSectionId === s.id)
      .sort((a, b) => a.order - b.order);
    const sell = items.reduce((acc, li) => acc + Number(li.lineSellPrice), 0);
    return { id: s.id, name: s.name, items, sell };
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editingItem = editingItemId
    ? estimate.lineItems.find((li) => li.id === editingItemId) ?? null
    : null;

  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          C · Schedule
        </p>
        <p className="mt-1 font-sans text-[12px] text-dim">
          {readOnly ? 'Read-only — estimate is locked.' : 'Click any line to edit.'}
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {sections.length === 0 ? (
          <div className="border border-dashed border-rule p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              No scope sections
            </p>
            <p className="mt-2 font-sans text-[12px] text-dim">
              Generate a draft (left) and Quill will populate sections here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {sections.map((s, i) => {
              const open = expanded.has(s.id);
              return (
                <li key={s.id} className="border-b border-rule-soft last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={open}
                    data-testid={`schedule-section-${s.id}`}
                    className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-paper"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                        <span aria-hidden className="mr-1 text-dim">
                          {open ? '▾' : '▸'}
                        </span>
                        {String.fromCharCode(65 + i)} · {s.name}
                      </p>
                      <p className="font-mono text-[10px] tabular-nums text-dim">
                        {s.items.length} item{s.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="font-mono text-[12px] tabular-nums text-ink">
                      {fmt(s.sell)}
                    </p>
                  </button>
                  {open && s.items.length > 0 ? (
                    <ul className="flex flex-col border-l border-rule-soft pl-3">
                      {s.items.map((item) => (
                        <li key={item.id}>
                          <ScheduleLineRow
                            item={item}
                            onClick={() => setEditingItemId(item.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="border-t-[1.5px] border-ink px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Total</p>
          <p className="font-mono text-[16px] tabular-nums text-ink">
            {fmt(Number(estimate.totalSellPrice))}
          </p>
        </div>
      </footer>

      {editingItem ? (
        <LineItemEditor
          key={editingItem.id}
          estimate={estimate}
          item={editingItem}
          onClose={() => setEditingItemId(null)}
        />
      ) : null}
    </section>
  );
}

function ScheduleLineRow({
  item,
  onClick,
}: {
  item: LineItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`schedule-line-${item.id}`}
      className="flex w-full items-baseline justify-between gap-2 border-b border-rule-soft py-1.5 pr-1 text-left last:border-b-0 hover:bg-paper"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[12px] text-ink" title={item.description}>
          {item.description}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-label text-dim tabular-nums">
          {fmtQty(item.quantity)} {item.unitOfMeasure}
          {item.aiAssumption ? ' · assumed' : ''}
          {item.status === 'NO_PRICE'
            ? ' · no price'
            : item.status === 'NEEDS_REVIEW'
              ? ' · review'
              : item.status === 'PENDING_SUB_QUOTE'
                ? ' · sub'
                : ''}
        </p>
      </div>
      <p className="font-mono text-[11px] tabular-nums text-ink">
        {fmt(Number(item.lineSellPrice))}
      </p>
    </button>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtQty(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
