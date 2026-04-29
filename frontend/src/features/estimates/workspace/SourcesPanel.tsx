import { useState } from 'react';
import type { EstimateDetail } from '@/features/estimates/types';
import { AddSourceModal } from '@/features/estimates/sources/AddSourceModal';
import { EditSourceModal } from '@/features/estimates/sources/EditSourceModal';
import { Button, Card } from '@/components/ui';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

export function SourcesPanel({
  estimate,
  bare = false,
}: {
  estimate: EstimateDetail;
  bare?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const editingSource = editingId
    ? estimate.sourceInputs.find((s) => s.id === editingId) ?? null
    : null;

  const body = (
    <>
      {!readOnly ? (
        <div className="flex justify-end px-4 pt-4">
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            + Add source
          </Button>
        </div>
      ) : null}
      <div className="flex-1 overflow-auto p-4">
        {estimate.sourceInputs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-secondary bg-bg-tertiary p-6 text-center">
            <p className="text-[13px] font-medium text-text-primary">No sources yet</p>
            <p className="mt-1 text-[12px] text-text-secondary">
              Paste a transcript, email, or notes so Quill has context.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {estimate.sourceInputs.map((s) => (
              <li key={s.id} data-testid={`source-${s.id}`}>
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  data-testid={`source-${s.id}-open`}
                  className="block h-full w-full rounded-md border border-border-primary bg-bg-primary p-3 text-left transition-colors duration-fast hover:border-border-secondary hover:bg-bg-tertiary"
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                    {labelType(s.type)}
                    {s.fileUrl ? ' · file' : null}
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-text-primary">{s.title}</p>
                  {s.content ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-text-secondary">
                      {s.content}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddSourceModal open={addOpen} onClose={() => setAddOpen(false)} estimateId={estimate.id} />
      {editingSource ? (
        <EditSourceModal
          key={editingSource.id}
          estimateId={estimate.id}
          source={editingSource}
          readOnly={readOnly}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );

  if (bare) return <div className="flex flex-col">{body}</div>;
  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span>Sources</span>
          <span className="text-[12px] tabular-nums text-text-tertiary">
            {estimate.sourceInputs.length}
          </span>
        </span>
      }
      actions={
        !readOnly ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            + Add
          </Button>
        ) : null
      }
      className="!p-0 flex h-full flex-col"
    >
      {body}
    </Card>
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
