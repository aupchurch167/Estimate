/**
 * Single source of truth for status → Badge variant mapping (Phase 8.1).
 *
 * Every status indicator across the app reads from here so the same
 * green means the same thing whether it's an estimate, a deal, or a
 * compliance row.
 *
 * Keys are case-sensitive but `statusVariant()` lower-cases the input
 * so callers don't have to remember whether the backend returns
 * 'APPROVED' or 'approved'.
 */

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_MAP: Record<string, BadgeVariant> = {
  // Estimate statuses
  draft: 'neutral',
  in_review: 'info',
  approved: 'success',
  sent: 'info',
  won: 'success',
  lost: 'danger',
  revised: 'warning',

  // Line item statuses
  confirmed: 'success',
  needs_review: 'warning',
  assumed: 'warning',
  no_price: 'danger',
  pending_sub_quote: 'warning',

  // AI run statuses
  pending: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'neutral',

  // Invitation / compliance / generic
  active: 'success',
  inactive: 'neutral',
  compliant: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
  non_compliant: 'danger',
  missing: 'neutral',

  // Action item severity
  info: 'info',
  warning: 'warning',
  at_risk: 'warning',
  critical: 'danger',
  overdue: 'danger',
  completed: 'success',

  // Deal stages (for downstream pipeline UI)
  new: 'info',
  engaged: 'info',
  nurture: 'warning',
  dead: 'danger',
  site_visit: 'info',
  estimating: 'info',
  bid_submitted: 'warning',
  contract_signed: 'success',
  in_construction: 'success',
  ready_to_bill: 'success',
  complete_closed: 'success',
};

/**
 * Resolve a status string to a Badge variant. Falls back to 'neutral'
 * for unknown values so the UI never breaks on a new backend status.
 */
export function statusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'neutral';
  return STATUS_MAP[status.toLowerCase()] ?? 'neutral';
}

export { STATUS_MAP };
