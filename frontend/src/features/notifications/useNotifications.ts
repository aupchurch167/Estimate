import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { AppNotification } from './types';

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const;

const POLL_INTERVAL_MS = 30_000;

export function useUnreadCount() {
  return useQuery<{ unreadCount: number }, AxiosError>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      const res = await api.get<{ unreadCount: number }>(
        '/api/notifications/unread-count',
      );
      return res.data;
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useNotifications(opts: { enabled?: boolean; limit?: number } = {}) {
  const { enabled = true, limit } = opts;
  return useQuery<{ notifications: AppNotification[] }, AxiosError>({
    queryKey: [...NOTIFICATIONS_KEY, { limit }],
    queryFn: async () => {
      const res = await api.get<{ notifications: AppNotification[] }>(
        `/api/notifications${limit ? `?limit=${limit}` : ''}`,
      );
      return res.data;
    },
    enabled,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation<{ notification: AppNotification }, AxiosError, string>({
    mutationFn: async (id) => {
      const res = await api.patch<{ notification: AppNotification }>(
        `/api/notifications/${id}`,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ count: number }, AxiosError>({
    mutationFn: async () => {
      const res = await api.post<{ count: number }>('/api/notifications/read-all');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}
