import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import type { EstimateDetail } from '@/features/estimates/types';
import { useCreateExport, useSnapshots } from './useReviewWorkspace';

/**
 * Triggers a PDF export of the latest snapshot. Renders the button only
 * when at least one snapshot exists (the schema FK requires it). Opens
 * the signed download URL in a new tab on success.
 */
export function ExportPdfButton({ estimate }: { estimate: EstimateDetail }) {
  const snapshots = useSnapshots(estimate.id);
  const create = useCreateExport(estimate.id);

  const hasSnapshot = (snapshots.data?.snapshots?.length ?? 0) > 0;

  const onClick = async () => {
    create.reset();
    try {
      const result = await create.mutateAsync();
      if (typeof window !== 'undefined') {
        window.open(result.downloadUrl, '_blank', 'noopener');
      }
    } catch {
      // banner shown below
    }
  };

  const disabledReason = !hasSnapshot
    ? 'Approve the estimate first to enable PDF export.'
    : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={create.isPending || !hasSnapshot}
        title={disabledReason ?? ''}
        data-testid="export-pdf"
        className="border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {create.isPending ? 'Exporting…' : 'Export PDF'}
      </button>
      {create.error ? (
        <p
          role="alert"
          className="font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {mapExportError(create.error as AxiosError)}
        </p>
      ) : null}
    </div>
  );
}

function mapExportError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'no_snapshot_to_export') {
    return 'Approve the estimate first to enable PDF export.';
  }
  if (code === 'unsupported_export_format') {
    return 'That export format is not supported yet.';
  }
  return backendErrorMessage(err, 'Could not export PDF.');
}
