/**
 * Permission library — frontend mirror of backend/src/lib/permissions.ts.
 *
 * Same shape, same behavior, same tests (parameterized over all roles).
 * When you change a function on either side, change the other and confirm
 * both test suites pass — backend and frontend MUST NOT drift.
 */

import type { UserRole } from '@/features/auth/types';

export type { UserRole } from '@/features/auth/types';

export interface PermissionUser {
  id: string;
  role: UserRole;
}

export interface PermissionEstimate {
  drafterId: string;
  reviewerId: string | null;
  status:
    | 'DRAFT'
    | 'IN_REVIEW'
    | 'APPROVED'
    | 'SENT'
    | 'WON'
    | 'LOST'
    | 'REVISED';
}

export interface PermissionOrgSettings {
  drafterCanSend: boolean;
}

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(['OWNER', 'ADMIN']);

export function canManageUsers(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function canManagePricing(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function canManageOrg(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function canCreateEstimate(role: UserRole): boolean {
  return ADMIN_ROLES.has(role) || role === 'ESTIMATOR';
}

export function canEditEstimate(user: PermissionUser, estimate: PermissionEstimate): boolean {
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'ESTIMATOR') {
    return estimate.drafterId === user.id || estimate.reviewerId === user.id;
  }
  return false;
}

export function canDeleteEstimate(user: PermissionUser, estimate: PermissionEstimate): boolean {
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'ESTIMATOR') {
    return estimate.drafterId === user.id && estimate.status === 'DRAFT';
  }
  return false;
}

export function canSendEstimate(
  user: PermissionUser,
  estimate: PermissionEstimate,
  orgSettings: PermissionOrgSettings,
): boolean {
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role !== 'ESTIMATOR') return false;
  if (!orgSettings.drafterCanSend) return false;
  return estimate.drafterId === user.id || estimate.reviewerId === user.id;
}

// MVP: every authenticated user sees cost. Hiding it from PM/VIEWER is P2.
export function canViewCostData(_role: UserRole): boolean {
  return true;
}

// ─── Review workflow ──────────────────────────────────────────────────────

export function canSubmitEstimateForReview(
  user: PermissionUser,
  estimate: PermissionEstimate,
): boolean {
  if (estimate.status !== 'DRAFT' && estimate.status !== 'REVISED') return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'ESTIMATOR') return estimate.drafterId === user.id;
  return false;
}

export function canReviewEstimate(
  user: PermissionUser,
  estimate: PermissionEstimate,
): boolean {
  if (estimate.status !== 'IN_REVIEW') return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'ESTIMATOR') return estimate.reviewerId === user.id;
  return false;
}

export function canUnlockApprovedEstimate(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}
