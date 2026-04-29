import { useState } from 'react';
import type { EstimateDetail } from '@/features/estimates/types';
import { AddSourceModal } from '@/features/estimates/sources/AddSourceModal';
import { EditSourceModal } from '@/features/estimates/sources/EditSourceModal';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

export function SourcesPanel({ estimate }: { estimate: EstimateDetail }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const editingSource = editingId
    ? estimate.sourceInputs.find((s) => s.id === editingId) ?? null
    : null;

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
              <li key={s.id} data-testid={`source-${s.id}`}>
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  data-testid={`source-${s.id}-open`}
                  className="group block w-full border border-rule-soft bg-paper p-3 text-left transition hover:border-ink hover:bg-paper-elevated"
                >
                  <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                    {labelType(s.type)}
                    {s.fileUrl ? ' · file' : null}
                  </p>
                  <p className="mt-1 font-sans text-[12px] text-ink">{s.title}</p>
                  {s.content ? (
                    <p className="mt-1 line-clamp-2 font-sans text-[11px] text-dim">
                      {s.content}
                    </p>
                  ) : null}
                </button>
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
      {editingSource ? (
        <EditSourceModal
          key={editingSource.id}
          estimateId={estimate.id}
          source={editingSource}
          readOnly={readOnly}
          onClose={() => setEditingId(null)}
        />
      ) : null}
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
