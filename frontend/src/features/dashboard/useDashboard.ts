import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { DashboardPayload } from './types';

export const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

export function useDashboard() {
  return useQuery<DashboardPayload, AxiosError>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<DashboardPayload>('/api/dashboard');
      return res.data;
    },
    refetchOnWindowFocus: true,
  });
}
