import { useState } from 'react';
import type { EstimateDetail, LineItem } from '@/features/estimates/types';
import { LineItemEditor } from '@/features/estimates/grid/LineItemEditor';
import { Badge } from '@/components/ui';

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
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-border-primary bg-bg-primary shadow-sm">
      <header className="border-b border-border-primary px-4 py-3">
        <p className="text-[15px] font-medium text-text-primary">Schedule</p>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          {readOnly ? 'Read-only — estimate is locked.' : 'Click any line to edit.'}
        </p>
      </header>
      <div className="flex-1 overflow-auto p-2">
        {sections.length === 0 ? (
          <div className="m-4 rounded-md border border-dashed border-border-secondary bg-bg-tertiary p-6 text-center">
            <p className="text-[13px] font-medium text-text-primary">No scope sections yet</p>
            <p className="mt-1 text-[12px] text-text-secondary">
              Generate a draft on the left and Quill will populate sections here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {sections.map((s, i) => {
              const open = expanded.has(s.id);
              return (
                <li
                  key={s.id}
                  className="border-b border-border-primary last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={open}
                    data-testid={`schedule-section-${s.id}`}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-bg-tertiary"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span aria-hidden className="text-text-tertiary">
                        {open ? '▾' : '▸'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-text-primary">
                          {String.fromCharCode(65 + i)} · {s.name}
                        </p>
                        <p className="text-[11px] tabular-nums text-text-tertiary">
                          {s.items.length} item{s.items.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <p className="font-mono text-[13px] tabular-nums text-text-primary">
                      {fmt(s.sell)}
                    </p>
                  </button>
                  {open && s.items.length > 0 ? (
                    <ul className="flex flex-col border-l border-border-primary pl-2 mx-3 mb-2">
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
      <footer className="border-t border-border-primary bg-bg-secondary px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            Total
          </p>
          <p className="font-mono text-[18px] font-semibold tabular-nums text-text-primary">
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

function ScheduleLineRow({ item, onClick }: { item: LineItem; onClick: () => void }) {
  const flagVariant: 'warning' | 'danger' | undefined =
    item.status === 'NO_PRICE'
      ? 'danger'
      : item.status === 'NEEDS_REVIEW' || item.status === 'PENDING_SUB_QUOTE' || item.aiAssumption
        ? 'warning'
        : undefined;
  const flagLabel =
    item.status === 'NO_PRICE'
      ? 'No price'
      : item.status === 'NEEDS_REVIEW'
        ? 'Review'
        : item.status === 'PENDING_SUB_QUOTE'
          ? 'Sub-quote'
          : item.aiAssumption
            ? 'Assumed'
            : null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`schedule-line-${item.id}`}
      className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-tertiary"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] text-text-primary" title={item.description}>
            {item.description}
          </p>
          {flagVariant && flagLabel ? (
            <Badge variant={flagVariant} size="sm">
              {flagLabel}
            </Badge>
          ) : null}
        </div>
        <p className="text-[11px] tabular-nums text-text-tertiary">
          {fmtQty(item.quantity)} {item.unitOfMeasure}
        </p>
      </div>
      <p className="font-mono text-[12px] tabular-nums text-text-primary">
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
