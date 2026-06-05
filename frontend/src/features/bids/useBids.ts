import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { BidPackage, BidPackageStatus, BidResponse, TradeCanonical } from './types';

export const BID_PACKAGES_KEY = ['bid-packages'] as const;
export const BID_RESPONSES_KEY = ['bid-responses'] as const;
export const TRADES_KEY = ['trades-canonical'] as const;

// ─── Trades ─────────────────────────────────────────────────────────────────

export function useTrades() {
  return useQuery<TradeCanonical[], AxiosError>({
    queryKey: TRADES_KEY,
    queryFn: async () => (await api.get<TradeCanonical[]>('/api/trades/canonical')).data,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Bid Packages ───────────────────────────────────────────────────────────

export function useBidPackages(params?: { estimateId?: string; status?: BidPackageStatus }) {
  return useQuery<BidPackage[], AxiosError>({
    queryKey: [...BID_PACKAGES_KEY, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.estimateId) searchParams.set('estimateId', params.estimateId);
      if (params?.status) searchParams.set('status', params.status);
      return (await api.get<BidPackage[]>(`/api/bid-packages?${searchParams}`)).data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useBidPackage(id: string) {
  return useQuery<BidPackage, AxiosError>({
    queryKey: [...BID_PACKAGES_KEY, id],
    queryFn: async () => (await api.get<BidPackage>(`/api/bid-packages/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateBidPackage() {
  const qc = useQueryClient();
  return useMutation<BidPackage, AxiosError, {
    estimateId: string;
    title: string;
    description?: string;
    tradeCode?: string;
    tradeCanonicalId?: string;
    dueDate?: string;
  }>({
    mutationFn: async (input) => (await api.post<BidPackage>('/api/bid-packages', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

export function useUpdateBidPackage() {
  const qc = useQueryClient();
  return useMutation<BidPackage, AxiosError, { id: string } & Record<string, unknown>>({
    mutationFn: async ({ id, ...body }) =>
      (await api.patch<BidPackage>(`/api/bid-packages/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

export function usePublishBidPackage() {
  const qc = useQueryClient();
  return useMutation<BidPackage, AxiosError, string>({
    mutationFn: async (id) => (await api.post<BidPackage>(`/api/bid-packages/${id}/publish`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

export function useCloseBidPackage() {
  const qc = useQueryClient();
  return useMutation<BidPackage, AxiosError, string>({
    mutationFn: async (id) => (await api.post<BidPackage>(`/api/bid-packages/${id}/close`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

export function useDeleteBidPackage() {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => { await api.delete(`/api/bid-packages/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

// ─── Bid Requests ───────────────────────────────────────────────────────────

export function useAddBidRequest() {
  const qc = useQueryClient();
  return useMutation<unknown, AxiosError, {
    bidPackageId: string;
    vendorName: string;
    vendorEmail: string;
    vendorPhone?: string;
    coreVendorId?: string;
  }>({
    mutationFn: async ({ bidPackageId, ...body }) =>
      (await api.post(`/api/bid-packages/${bidPackageId}/requests`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

export function useRemoveBidRequest() {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, { bidPackageId: string; requestId: string }>({
    mutationFn: async ({ bidPackageId, requestId }) => {
      await api.delete(`/api/bid-packages/${bidPackageId}/requests/${requestId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

// ─── Bid Responses ──────────────────────────────────────────────────────────

export function useBidResponses(packageId: string) {
  return useQuery<BidResponse[], AxiosError>({
    queryKey: [...BID_RESPONSES_KEY, packageId],
    queryFn: async () =>
      (await api.get<BidResponse[]>(`/api/bids/packages/${packageId}/responses`)).data,
    enabled: !!packageId,
  });
}

// ─── Award + Reconcile ─────────────────────────────────────────────────────

export function useAwardBid() {
  const qc = useQueryClient();
  return useMutation<unknown, AxiosError, { bidRequestId: string }>({
    mutationFn: async (body) => (await api.post('/api/bids/award', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY });
      qc.invalidateQueries({ queryKey: BID_RESPONSES_KEY });
    },
  });
}

export function useReconcileBid() {
  const qc = useQueryClient();
  return useMutation<unknown, AxiosError, {
    bidResponseId: string;
    estimateId: string;
    scopeSectionId: string;
  }>({
    mutationFn: async (body) => (await api.post('/api/bids/reconcile', body)).data,
    onSuccess: () => qc.invalidateQueries(),
  });
}
