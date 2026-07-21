import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type {
  BidDocument,
  BidPackage,
  BidPackageStatus,
  BidResponse,
  CoreVendor,
  ProofCoiRequest,
  ProofVendor,
  TradeCanonical,
} from './types';

export const BID_PACKAGES_KEY = ['bid-packages'] as const;
export const BID_RESPONSES_KEY = ['bid-responses'] as const;
export const BID_DOCUMENTS_KEY = ['bid-documents'] as const;
export const TRADES_KEY = ['trades-canonical'] as const;
export const CORE_VENDORS_KEY = ['core-vendors'] as const;
export const PROOF_VENDORS_KEY = ['proof-vendors'] as const;

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
    personalNote?: string;
    tradeCode?: string;
    tradeCanonicalId?: string;
    dueDate?: string;
  }>({
    mutationFn: async (input) => (await api.post<BidPackage>('/api/bid-packages', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY }),
  });
}

// ─── Vendor directory (Helm Core, when integration is enabled) ────────────────

export function useCoreVendors(search?: string, enabled = true) {
  return useQuery<{ enabled: boolean; data: CoreVendor[] }, AxiosError>({
    queryKey: [...CORE_VENDORS_KEY, search ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await api.get<{ enabled: boolean; data: CoreVendor[] }>(
        `/api/core/vendors?${params}`,
      );
      return res.data;
    },
    enabled,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// ─── Vendor directory (Proof, when integration is enabled) ────────────────────

export function useProofVendors(search?: string, enabled = true) {
  return useQuery<{ enabled: boolean; data: ProofVendor[] }, AxiosError>({
    queryKey: [...PROOF_VENDORS_KEY, search ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await api.get<{ enabled: boolean; data: ProofVendor[] }>(
        `/api/proof/vendors?${params}`,
      );
      return res.data;
    },
    enabled,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// Trigger a COI request for a Proof vendor. Refreshes the directory so the
// vendor's `coiLastRequestedAt` / status reflect the pending request.
export function useRequestCoi() {
  const qc = useQueryClient();
  return useMutation<
    { enabled: boolean; data: ProofCoiRequest },
    AxiosError,
    { proofVendorId: string }
  >({
    mutationFn: async ({ proofVendorId }) =>
      (await api.post(`/api/proof/vendors/${proofVendorId}/coi-request`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROOF_VENDORS_KEY }),
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
    proofVendorId?: string;
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

// ─── Bid Documents (scope docs the estimator attaches) ───────────────────────

export function useBidDocuments(packageId: string) {
  return useQuery<BidDocument[], AxiosError>({
    queryKey: [...BID_DOCUMENTS_KEY, packageId],
    queryFn: async () =>
      (await api.get<BidDocument[]>(`/api/bids/packages/${packageId}/documents`)).data,
    enabled: !!packageId,
  });
}

interface SignedUpload {
  url: string;
  key: string;
  expiresIn: number;
  publicUrl: string;
}

/**
 * Uploads one file to a bid package: mints a presigned PUT to Spaces, pushes
 * the bytes directly from the browser, then records the document metadata.
 */
export function useUploadBidDocument() {
  const qc = useQueryClient();
  return useMutation<BidDocument, AxiosError | Error, { packageId: string; file: File }>({
    mutationFn: async ({ packageId, file }) => {
      const signed = (
        await api.post<SignedUpload>(`/api/bids/packages/${packageId}/documents/sign`, {
          fileName: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
        })
      ).data;
      const put = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-amz-acl': 'public-read' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      return (
        await api.post<BidDocument>(`/api/bids/packages/${packageId}/documents`, {
          fileName: file.name,
          fileUrl: signed.publicUrl,
          fileSize: file.size,
          mimeType: file.type,
        })
      ).data;
    },
    onSuccess: (_doc, { packageId }) => {
      qc.invalidateQueries({ queryKey: [...BID_DOCUMENTS_KEY, packageId] });
      qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY });
    },
  });
}

export function useRemoveBidDocument() {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, { packageId: string; docId: string }>({
    mutationFn: async ({ docId }) => {
      await api.delete(`/api/bids/documents/${docId}`);
    },
    onSuccess: (_v, { packageId }) => {
      qc.invalidateQueries({ queryKey: [...BID_DOCUMENTS_KEY, packageId] });
      qc.invalidateQueries({ queryKey: BID_PACKAGES_KEY });
    },
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
