/**
 * Conditional render based on the current user's role.
 *
 *   <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
 *     <InviteButton />
 *   </RoleGate>
 *
 *   <RoleGate allowedRoles={['OWNER']} fallback={<ContactOwner />}>
 *     <DangerZone />
 *   </RoleGate>
 *
 * Renders nothing (or the fallback) if there's no authenticated user.
 */

import type { ReactNode } from 'react';
import { useAuthContext } from '@/context/useAuthContext';
import type { UserRole } from '@/features/auth/types';

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuthContext();
  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
