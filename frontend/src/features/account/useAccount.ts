import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { ME_QUERY_KEY } from '@/features/auth/useAuth';
import type { SafeUser } from '@/features/auth/types';

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation<SafeUser, AxiosError, UpdateProfileInput>({
    mutationFn: async (patch) => {
      const res = await api.patch<{ user: SafeUser }>(`/api/users/${userId}`, patch);
      return res.data.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword(userId: string) {
  return useMutation<void, AxiosError, ChangePasswordInput>({
    mutationFn: async (input) => {
      await api.patch(`/api/users/${userId}/password`, input);
    },
  });
}

export interface SignedUpload {
  url: string;
  key: string;
  expiresIn: number;
  publicUrl: string;
}

export function useSignAvatarUpload(userId: string) {
  return useMutation<SignedUpload, AxiosError, { contentType: string; fileSizeBytes: number }>({
    mutationFn: async (input) => {
      const res = await api.post<SignedUpload>(`/api/users/${userId}/avatar`, input);
      return res.data;
    },
  });
}
