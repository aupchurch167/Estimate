import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { AuthMeResponse, SafeUser } from './types';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useCurrentUser() {
  return useQuery<AuthMeResponse | null, AxiosError>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await api.get<AuthMeResponse>('/api/auth/me');
        return res.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        if (axiosErr.response?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });
}

export interface LoginInput {
  email: string;
  password: string;
}
export interface LoginResponse {
  user: SafeUser;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<LoginResponse, AxiosError, LoginInput>({
    mutationFn: async (input) => {
      const res = await api.post<LoginResponse>('/api/auth/login', input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export interface GoogleLoginInput {
  credential: string;
}

export function useGoogleLogin() {
  const qc = useQueryClient();
  return useMutation<LoginResponse, AxiosError, GoogleLoginInput>({
    mutationFn: async (input) => {
      const res = await api.post<LoginResponse>('/api/auth/google', input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation<AuthMeResponse, AxiosError, SignupInput>({
    mutationFn: async (input) => {
      const res = await api.post<AuthMeResponse>('/api/auth/signup', input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<void, AxiosError>({
    mutationFn: async () => {
      await api.post('/api/auth/logout');
    },
    onSuccess: () => {
      qc.setQueryData(ME_QUERY_KEY, null);
      qc.clear();
    },
  });
}

/**
 * Read backend error code from an Axios error. Backend uses the
 * `{ error: { code, message, details? } }` envelope.
 */
export function backendErrorCode(err: AxiosError): string | null {
  const data = err.response?.data as { error?: { code?: string } } | undefined;
  return data?.error?.code ?? null;
}

export function backendErrorMessage(err: AxiosError, fallback = 'Something went wrong'): string {
  const data = err.response?.data as { error?: { message?: string } } | undefined;
  return data?.error?.message ?? fallback;
}
