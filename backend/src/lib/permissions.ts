/**
 * Permission library — backend.
 *
 * One function per role-gated operation. Both backend and frontend ship a
 * mirror of these signatures (frontend/src/lib/permissions.ts) — when you
 * change one, change the other. Tests on each side enforce the matrix
 * from brief Section 3.
 *
 * Functions take only the minimum data they need so they can be called
 * from middleware (with req.user) and services (with a Prisma user)
 * without coupling either side to a heavy type.
 */

import type { EstimateStatus, UserRole } from '@prisma/client';

export interface PermissionUser {
  id: string;
  role: UserRole;
}

export interface PermissionEstimate {
  drafterId: string;
  reviewerId: string | null;
  status: EstimateStatus;
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

// MVP decision: all authenticated users see cost. Hiding cost from specific
// roles is a P2 tweak.
export function canViewCostData(_role: UserRole): boolean {
  return true;
}

// ─── Review workflow ──────────────────────────────────────────────────────
//
// State machine (Phase 4.1):
//   DRAFT | REVISED  --submit-->  IN_REVIEW
//   IN_REVIEW        --approve--> APPROVED
//   IN_REVIEW        --request--> REVISED
//   APPROVED         --unlock-->  REVISED   (admin override)
//
// Send / mark won/lost / revise-from-sent are later phases.

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

/**
 * Close-out actions on a SENT estimate (Mark won / Mark lost / Revise
 * from sent). Same gate as canEditEstimate-on-SENT-modulo-status: admin
 * always; ESTIMATOR drafter or reviewer. drafterCanSend is NOT consulted
 * here — once the estimate is in front of the client, the people who
 * sent it should be able to close it out without an admin in the loop.
 */
export function canCloseOutEstimate(
  user: PermissionUser,
  estimate: PermissionEstimate,
): boolean {
  if (estimate.status !== 'SENT') return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'ESTIMATOR') {
    return estimate.drafterId === user.id || estimate.reviewerId === user.id;
  }
  return false;
}
