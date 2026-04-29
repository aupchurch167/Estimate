import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { estimateDetailKey } from '@/features/estimates/useEstimates';
import type { LineItem, ScopeSection } from '@/features/estimates/types';

const UNITS = [
  'SF',
  'LF',
  'CF',
  'EA',
  'HR',
  'DY',
  'LS',
  'CY',
  'SY',
  'GAL',
  'TON',
  'CUSTOM',
] as const;
export type UnitOfMeasure = (typeof UNITS)[number];
export const UNITS_OF_MEASURE = UNITS;

export const LINE_ITEM_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'NEEDS_REVIEW',
  'ASSUMED',
  'NO_PRICE',
  'PENDING_SUB_QUOTE',
] as const;
export type LineItemStatus = (typeof LINE_ITEM_STATUSES)[number];

// ─── Sections ──────────────────────────────────────────────────────────────

export function useCreateSection(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<ScopeSection, AxiosError, { name: string }>({
    mutationFn: async (input) => {
      const res = await api.post<{ section: ScopeSection }>(
        `/api/estimates/${estimateId}/scope-sections`,
        input,
      );
      return res.data.section;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export function useDeleteSection(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await api.delete(`/api/scope-sections/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export function usePatchSection(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<ScopeSection, AxiosError, { id: string; patch: { name?: string } }>({
    mutationFn: async ({ id, patch }) => {
      const res = await api.patch<{ section: ScopeSection }>(
        `/api/scope-sections/${id}`,
        patch,
      );
      return res.data.section;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

// ─── Line items ────────────────────────────────────────────────────────────

export interface CreateLineItemInput {
  description?: string;
  quantity?: string;
  unitOfMeasure?: UnitOfMeasure;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  markupPercent?: string | null;
}

export function useCreateLineItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<
    LineItem,
    AxiosError,
    { sectionId: string; payload?: CreateLineItemInput }
  >({
    mutationFn: async ({ sectionId, payload }) => {
      const res = await api.post<{ lineItem: LineItem }>(
        `/api/scope-sections/${sectionId}/line-items`,
        {
          description: payload?.description ?? 'New line',
          quantity: payload?.quantity ?? '1',
          unitOfMeasure: payload?.unitOfMeasure ?? 'EA',
          unitCostMaterial: payload?.unitCostMaterial ?? '0',
          unitCostLabor: payload?.unitCostLabor ?? '0',
          ...(payload?.markupPercent !== undefined
            ? { markupPercent: payload.markupPercent }
            : {}),
        },
      );
      return res.data.lineItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export interface PatchLineItemInput {
  description?: string;
  quantity?: string;
  unitOfMeasure?: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  markupPercent?: string | null;
  status?: LineItemStatus;
  aiAssumption?: string | null;
  internalNotes?: string | null;
  clientNotes?: string | null;
}

export function usePatchLineItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<LineItem, AxiosError, { id: string; patch: PatchLineItemInput }>({
    mutationFn: async ({ id, patch }) => {
      const res = await api.patch<{ lineItem: LineItem }>(`/api/line-items/${id}`, patch);
      return res.data.lineItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export function useDeleteLineItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await api.delete(`/api/line-items/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export function useBulkDeleteLineItems(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<{ count: number }, AxiosError, string[]>({
    mutationFn: async (ids) => {
      const res = await api.post<{ count: number }>('/api/line-items/bulk', {
        operation: 'delete',
        lineItemIds: ids,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}
