/**
 * Bind the permission helpers to the current user. Components call
 * `usePermissions()` and read booleans / call functions without needing
 * to remember to pass `user` everywhere.
 *
 *   const { canCreateEstimate, canSendEstimate } = usePermissions();
 *   if (!canCreateEstimate) return null;
 *   if (canSendEstimate(estimate, orgSettings)) { … }
 */

import { useMemo } from 'react';
import { useAuthContext } from '@/context/useAuthContext';
import {
  canCreateEstimate,
  canDeleteEstimate,
  canEditEstimate,
  canManageOrg,
  canManagePricing,
  canManageUsers,
  canSendEstimate,
  canViewCostData,
  type PermissionEstimate,
  type PermissionOrgSettings,
  type PermissionUser,
} from '@/lib/permissions';

export interface PermissionsApi {
  // Computed once for the current user.
  canManageUsers: boolean;
  canManagePricing: boolean;
  canManageOrg: boolean;
  canCreateEstimate: boolean;
  canViewCostData: boolean;

  // Per-estimate checks; pass the estimate (and optional orgSettings) at call site.
  canEditEstimate: (estimate: PermissionEstimate) => boolean;
  canDeleteEstimate: (estimate: PermissionEstimate) => boolean;
  canSendEstimate: (estimate: PermissionEstimate, orgSettings: PermissionOrgSettings) => boolean;
}

export function usePermissions(): PermissionsApi {
  const { user } = useAuthContext();

  return useMemo<PermissionsApi>(() => {
    const safeUser: PermissionUser | null = user ? { id: user.id, role: user.role } : null;
    return {
      canManageUsers: safeUser ? canManageUsers(safeUser.role) : false,
      canManagePricing: safeUser ? canManagePricing(safeUser.role) : false,
      canManageOrg: safeUser ? canManageOrg(safeUser.role) : false,
      canCreateEstimate: safeUser ? canCreateEstimate(safeUser.role) : false,
      canViewCostData: safeUser ? canViewCostData(safeUser.role) : false,
      canEditEstimate: (estimate) => (safeUser ? canEditEstimate(safeUser, estimate) : false),
      canDeleteEstimate: (estimate) => (safeUser ? canDeleteEstimate(safeUser, estimate) : false),
      canSendEstimate: (estimate, orgSettings) =>
        safeUser ? canSendEstimate(safeUser, estimate, orgSettings) : false,
    };
  }, [user]);
}
