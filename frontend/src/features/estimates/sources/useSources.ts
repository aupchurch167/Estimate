import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { estimateDetailKey } from '@/features/estimates/useEstimates';
import type { SourceInput } from '@/features/estimates/types';

export type SourceType =
  | 'TRANSCRIPT'
  | 'EMAIL'
  | 'SCOPE_NOTES'
  | 'MANUAL_TEXT'
  | 'PLAN_PDF'
  | 'COMPANYCAM_PROJECT'
  | 'REFERENCE_DOC';

export interface CreateSourceInput {
  type: SourceType;
  title: string;
  content?: string;
  fileUrl?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
}

export function useCreateSource(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<SourceInput, AxiosError, CreateSourceInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ sourceInput: SourceInput }>(
        `/api/estimates/${estimateId}/source-inputs`,
        input,
      );
      return res.data.sourceInput;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export function useDeleteSource(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await api.delete(`/api/source-inputs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export interface PatchSourceInput {
  title?: string;
  content?: string;
}

export function usePatchSource(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<
    SourceInput,
    AxiosError,
    { id: string; patch: PatchSourceInput }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await api.patch<{ sourceInput: SourceInput }>(
        `/api/source-inputs/${id}`,
        patch,
      );
      return res.data.sourceInput;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}
