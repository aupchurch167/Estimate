import type { EstimateStatus } from './types';

/**
 * Drafting-style status stamp — outlined uppercase mono with a tone-mapped
 * color per the brief's red/amber/green/blueprint palette. Compact (border
 * 1px, padding 0/0.5).
 */
export function StatusStamp({ status }: { status: EstimateStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${tone}`}
      data-testid={`status-stamp-${status}`}
    >
      {label(status)}
    </span>
  );
}

const STATUS_TONE: Record<EstimateStatus, string> = {
  DRAFT: 'border-rule text-dim',
  IN_REVIEW: 'border-mark-amber/60 text-mark-amber',
  APPROVED: 'border-mark-green/60 text-mark-green',
  SENT: 'border-blueprint/60 text-blueprint',
  WON: 'border-mark-green text-mark-green bg-mark-green/10',
  LOST: 'border-mark-red text-mark-red bg-mark-red/10',
  REVISED: 'border-mark-amber/60 text-mark-amber',
};

function label(status: EstimateStatus): string {
  if (status === 'IN_REVIEW') return 'In Review';
  if (status === 'WON') return 'Leased';
  return status.charAt(0) + status.slice(1).toLowerCase();
}
