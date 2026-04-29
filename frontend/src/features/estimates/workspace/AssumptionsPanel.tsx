import type { EstimateDetail } from '@/features/estimates/types';
import { Badge, Card, EmptyState } from '@/components/ui';

/**
 * Assumptions panel (Phase 8.1 layout).
 *
 * Surfaces every line item that has either an explicit AI assumption
 * or a status that demands review (NEEDS_REVIEW / NO_PRICE / PENDING_SUB_QUOTE)
 * so the drafter sees the "things Quill wasn't sure about" without
 * scrolling the schedule.
 */
export function AssumptionsPanel({ estimate }: { estimate: EstimateDetail }) {
  const sectionsById = new Map(estimate.scopeSections.map((s) => [s.id, s.name]));
  const flagged = estimate.lineItems
    .map((li) => {
      const variant: 'warning' | 'danger' | null =
        li.status === 'NO_PRICE'
          ? 'danger'
          : li.status === 'NEEDS_REVIEW' || li.status === 'PENDING_SUB_QUOTE' || li.aiAssumption
            ? 'warning'
            : null;
      if (!variant) return null;
      const flag =
        li.status === 'NO_PRICE'
          ? 'No price'
          : li.status === 'NEEDS_REVIEW'
            ? 'Needs review'
            : li.status === 'PENDING_SUB_QUOTE'
              ? 'Sub-quote'
              : 'Assumed';
      return {
        id: li.id,
        description: li.description,
        section: sectionsById.get(li.scopeSectionId) ?? 'Section',
        assumption: li.aiAssumption,
        flag,
        variant,
        confidence: li.aiConfidence ? Number(li.aiConfidence) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span>Assumptions</span>
          <span className="text-[12px] tabular-nums text-text-tertiary">{flagged.length}</span>
        </span>
      }
      className="!p-0 flex h-full flex-col"
    >
      {flagged.length === 0 ? (
        <EmptyState
          title="Nothing flagged"
          description="When Quill makes assumptions or can't price something, it'll show up here."
          className="px-4 py-6"
        />
      ) : (
        <ul className="flex-1 overflow-auto">
          {flagged.map((f) => (
            <li
              key={f.id}
              data-testid="assumption-row"
              className="border-b border-border-primary px-4 py-3 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                  {f.section}
                  {f.confidence !== null ? (
                    <span
                      className={`ml-2 ${
                        f.confidence >= 0.85
                          ? 'text-success'
                          : f.confidence >= 0.6
                            ? 'text-warning'
                            : 'text-danger'
                      }`}
                    >
                      {Math.round(f.confidence * 100)}%
                    </span>
                  ) : null}
                </p>
                <Badge variant={f.variant} size="sm">
                  {f.flag}
                </Badge>
              </div>
              <p className="mt-1 text-[13px] font-medium text-text-primary">{f.description}</p>
              {f.assumption ? (
                <p className="mt-1 border-l-2 border-warning/60 pl-3 text-[12px] text-text-secondary">
                  {f.assumption}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
