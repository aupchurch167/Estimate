import type { EstimateDetail } from '@/features/estimates/types';

/**
 * Schedule rollup — sums section subtotals from the line items already
 * loaded in EstimateDetail. Empty in 2.10 because line item CRUD lands
 * in 2.11.
 */
export function SchedulePanel({ estimate }: { estimate: EstimateDetail }) {
  const sections = estimate.scopeSections.map((s) => {
    const items = estimate.lineItems.filter((li) => li.scopeSectionId === s.id);
    const cost = items.reduce((acc, li) => acc + Number(li.lineCost), 0);
    const sell = items.reduce((acc, li) => acc + Number(li.lineSellPrice), 0);
    return { id: s.id, name: s.name, count: items.length, cost, sell };
  });

  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          C · Schedule
        </p>
        <p className="mt-1 font-sans text-[12px] text-dim">
          Sections + investment by phase
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {sections.length === 0 ? (
          <div className="border border-dashed border-rule p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              No scope sections
            </p>
            <p className="mt-2 font-sans text-[12px] text-dim">
              Sections + line items ship in Phase 2.11. Once the AI generation flow lands in
              3.2 you'll see them populate here automatically.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {sections.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center justify-between border-b border-rule-soft py-2"
              >
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                    {String.fromCharCode(65 + i)} · {s.name}
                  </p>
                  <p className="font-mono text-[10px] tabular-nums text-dim">
                    {s.count} item{s.count === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="font-mono text-[12px] tabular-nums text-ink">{fmt(s.sell)}</p>
              </li>
            ))}
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
    </section>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
