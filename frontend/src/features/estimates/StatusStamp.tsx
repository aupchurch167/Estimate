import type { EstimateStatus } from './types';
import { Badge } from '@/components/ui';

/**
 * Status stamp — thin wrapper over the Coach Badge primitive that
 * preserves the legacy `<StatusStamp status="DRAFT" />` API used
 * across the app while routing the variant resolution through the
 * shared statusMap.
 */
export function StatusStamp({ status }: { status: EstimateStatus }) {
  return (
    <Badge status={status} size="sm" data-testid={`status-stamp-${status}`}>
      {label(status)}
    </Badge>
  );
}

function label(status: EstimateStatus): string {
  return status === 'IN_REVIEW' ? 'In Review' : status.charAt(0) + status.slice(1).toLowerCase();
}
