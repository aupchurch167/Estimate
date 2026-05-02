import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';

export interface CoreAccount {
  id: string;
  name: string;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface CoreDeal {
  id: string;
  name: string;
  stage: string;
  value?: number | null;
  accountId: string;
}

interface CoreListResponse<T> {
  enabled: boolean;
  data: T[];
}

function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useCoreAccounts(search: string) {
  const debouncedSearch = useDebouncedValue(search, search ? 300 : 0);
  return useQuery<CoreListResponse<CoreAccount>, AxiosError>({
    queryKey: ['core', 'accounts', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await api.get<CoreListResponse<CoreAccount>>(
        `/api/core/accounts?${params.toString()}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useCoreDeals(accountId: string | null) {
  return useQuery<CoreListResponse<CoreDeal>, AxiosError>({
    queryKey: ['core', 'accounts', accountId, 'deals'],
    queryFn: async () => {
      const res = await api.get<CoreListResponse<CoreDeal>>(
        `/api/core/accounts/${accountId}/deals?limit=20`,
      );
      return res.data;
    },
    enabled: Boolean(accountId),
    staleTime: 30_000,
  });
}
