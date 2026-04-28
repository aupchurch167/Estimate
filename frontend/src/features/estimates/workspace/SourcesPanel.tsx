import { useState } from 'react';
import type { EstimateDetail } from '@/features/estimates/types';
import { AddSourceModal } from '@/features/estimates/sources/AddSourceModal';
import { useDeleteSource } from '@/features/estimates/sources/useSources';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

export function SourcesPanel({ estimate }: { estimate: EstimateDetail }) {
  const [addOpen, setAddOpen] = useState(false);
  const del = useDeleteSource(estimate.id);
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);

  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="flex items-baseline justify-between border-b border-rule-soft px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            A · Sources{' '}
            <span className="ml-1 font-mono text-[10px] tabular-nums">
              {estimate.sourceInputs.length}
            </span>
          </p>
          <p className="mt-1 font-sans text-[12px] text-dim">Transcripts, emails, scope notes</p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="border border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
          >
            + Add
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-auto p-4">
        {estimate.sourceInputs.length === 0 ? (
          <div className="border border-dashed border-rule p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              No sources yet
            </p>
            <p className="mt-2 font-sans text-[12px] text-dim">
              Paste a transcript, email, or notes to give the AI context for the draft.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {estimate.sourceInputs.map((s) => (
              <li
                key={s.id}
                className="group border border-rule-soft bg-paper p-3"
                data-testid={`source-${s.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                      {labelType(s.type)}
                    </p>
                    <p className="mt-1 font-sans text-[12px] text-ink">{s.title}</p>
                    {s.content ? (
                      <p className="mt-1 line-clamp-2 font-sans text-[11px] text-dim">
                        {s.content}
                      </p>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      aria-label="Delete source"
                      onClick={() => del.mutate(s.id)}
                      className="opacity-0 group-hover:opacity-100 font-mono text-[12px] text-dim hover:text-mark-red"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddSourceModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        estimateId={estimate.id}
      />
    </section>
  );
}

function labelType(type: string): string {
  switch (type) {
    case 'TRANSCRIPT':
      return 'Transcript';
    case 'EMAIL':
      return 'Email';
    case 'SCOPE_NOTES':
      return 'Scope notes';
    case 'MANUAL_TEXT':
      return 'Notes';
    case 'PLAN_PDF':
      return 'Plan PDF';
    case 'COMPANYCAM_PROJECT':
      return 'CompanyCam';
    case 'REFERENCE_DOC':
      return 'Reference';
    default:
      return type;
  }
}
