import { Badge } from '@/components/ui';
import type { ProofCoiStatus } from './types';

const COI_META: Record<ProofCoiStatus, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  compliant: { variant: 'success', label: 'COI compliant' },
  expiring_soon: { variant: 'warning', label: 'COI expiring' },
  expired: { variant: 'danger', label: 'COI expired' },
  pending: { variant: 'info', label: 'COI pending' },
  none: { variant: 'neutral', label: 'No COI' },
};

/**
 * Renders a vendor's COI compliance as a colored badge. Proof owns the status
 * computation; this only maps the enum to a variant + label. Optionally shows
 * the expiration date on the "expiring" state.
 */
export function CoiBadge({
  status,
  expiresAt,
}: {
  status: ProofCoiStatus | null | undefined;
  expiresAt?: string | null;
}) {
  const meta = COI_META[status ?? 'none'];
  const showDate = status === 'expiring_soon' && expiresAt;
  return (
    <Badge variant={meta.variant}>
      {meta.label}
      {showDate ? ` · ${expiresAt}` : ''}
    </Badge>
  );
}
