import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { SafeUser, UserRole } from '@/features/auth/types';
import type { InvitationListItem, InvitationStatus, PublicInvitationView } from './types';

export const USERS_QUERY_KEY = ['team', 'users'] as const;
export const INVITATIONS_QUERY_KEY = ['team', 'invitations'] as const;

export function useUsers() {
  return useQuery<SafeUser[], AxiosError>({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ users: SafeUser[] }>('/api/users');
      return res.data.users;
    },
  });
}

export type AdminAssignableRole = 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';

export function useChangeUserRole() {
  const qc = useQueryClient();
  return useMutation<
    SafeUser,
    AxiosError,
    { userId: string; role: AdminAssignableRole }
  >({
    mutationFn: async ({ userId, role }) => {
      const res = await api.patch<{ user: SafeUser }>(
        `/api/users/${userId}/role`,
        { role },
      );
      return res.data.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation<SafeUser, AxiosError, { userId: string }>({
    mutationFn: async ({ userId }) => {
      const res = await api.post<{ user: SafeUser }>(
        `/api/users/${userId}/deactivate`,
      );
      return res.data.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation<SafeUser, AxiosError, { userId: string }>({
    mutationFn: async ({ userId }) => {
      const res = await api.post<{ user: SafeUser }>(
        `/api/users/${userId}/reactivate`,
      );
      return res.data.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

export function useInvitations(status?: InvitationStatus | 'all') {
  return useQuery<InvitationListItem[], AxiosError>({
    queryKey: [...INVITATIONS_QUERY_KEY, status ?? 'all'],
    queryFn: async () => {
      const url =
        status && status !== 'all'
          ? `/api/invitations?status=${status.toLowerCase()}`
          : '/api/invitations';
      const res = await api.get<{ invitations: InvitationListItem[] }>(url);
      return res.data.invitations;
    },
  });
}

export interface InviteInput {
  email: string;
  role: UserRole;
}

export interface InviteResponse {
  invitation: InvitationListItem;
  acceptUrl: string;
  emailDispatched: boolean;
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation<InviteResponse, AxiosError, InviteInput>({
    mutationFn: async (input) => {
      const res = await api.post<InviteResponse>('/api/invitations', input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await api.delete(`/api/invitations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

// ─── Public (token-gated) ─────────────────────────────────────────────────

export function usePublicInvitation(token: string) {
  return useQuery<PublicInvitationView, AxiosError>({
    queryKey: ['public-invitation', token],
    queryFn: async () => {
      const res = await api.get<PublicInvitationView>(`/api/invitations/${token}`);
      return res.data;
    },
    enabled: Boolean(token),
    retry: false,
  });
}

export interface AcceptInvitationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AcceptInvitationResponse {
  user: SafeUser;
  organization: { id: string; name: string; slug: string };
}

export function useAcceptInvitation(token: string) {
  return useMutation<AcceptInvitationResponse, AxiosError, AcceptInvitationInput>({
    mutationFn: async (input) => {
      const res = await api.post<AcceptInvitationResponse>(
        `/api/invitations/${token}/accept`,
        input,
      );
      return res.data;
    },
  });
}
