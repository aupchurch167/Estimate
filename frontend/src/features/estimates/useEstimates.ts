import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type {
  Estimate,
  EstimateDetail,
  EstimateStatus,
  PaginatedEstimates,
} from './types';

export const ESTIMATES_QUERY_KEY = ['estimates'] as const;
export const estimateDetailKey = (id: string) => ['estimates', 'detail', id] as const;

export function useEstimateDetail(id: string | undefined) {
  return useQuery<EstimateDetail, AxiosError>({
    queryKey: id ? estimateDetailKey(id) : ['estimates', 'detail', '_'],
    queryFn: async () => {
      const res = await api.get<{ estimate: EstimateDetail }>(`/api/estimates/${id}`);
      return res.data.estimate;
    },
    enabled: Boolean(id),
    retry: false,
  });
}

export interface ListEstimatesArgs {
  status?: EstimateStatus[];
  drafterId?: string;
  reviewerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'updatedAt' | 'createdAt' | 'number' | 'totalSellPrice';
  order?: 'asc' | 'desc';
}

export function useEstimates(args: ListEstimatesArgs = {}) {
  return useQuery<PaginatedEstimates, AxiosError>({
    queryKey: [...ESTIMATES_QUERY_KEY, args],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (args.status && args.status.length > 0) {
        for (const s of args.status) params.append('status', s);
      }
      if (args.drafterId) params.set('drafterId', args.drafterId);
      if (args.reviewerId) params.set('reviewerId', args.reviewerId);
      if (args.search) params.set('search', args.search);
      params.set('page', String(args.page ?? 1));
      params.set('limit', String(args.pageSize ?? 25));
      if (args.sort) params.set('sort', args.sort);
      if (args.order) params.set('order', args.order);
      const res = await api.get<PaginatedEstimates>(
        `/api/estimates?${params.toString()}`,
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export interface CreateEstimateInput {
  title: string;
  clientCompanyName?: string | null;
  projectAddressLine1?: string | null;
  projectCity?: string | null;
  projectState?: string | null;
  projectPostalCode?: string | null;
  // Core entity links — only sent when VITE_HELM_CORE_INTEGRATION is on
  coreAccountId?: string | null;
  coreDealId?: string | null;
}

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation<Estimate, AxiosError, CreateEstimateInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ estimate: Estimate }>('/api/estimates', input);
      return res.data.estimate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
    },
  });
}
