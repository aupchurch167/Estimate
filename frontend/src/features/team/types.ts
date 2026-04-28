import type { UserRole } from '@/features/auth/types';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface InvitationListItem {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedById: string;
  acceptedUserId: string | null;
  createdAt: string;
  status: InvitationStatus;
}

export interface PublicInvitationView {
  email: string;
  role: UserRole;
  organizationName: string;
  inviterName: string;
  expiresAt: string;
}
