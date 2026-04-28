import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { estimateDetailKey } from '@/features/estimates/useEstimates';
import type { ConversationResponse } from './types';

export const conversationKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'conversation'] as const;

export function useConversation(estimateId: string | undefined) {
  return useQuery<ConversationResponse, AxiosError>({
    queryKey: estimateId ? conversationKey(estimateId) : ['conversation', '_'],
    queryFn: async () => {
      const res = await api.get<ConversationResponse>(
        `/api/estimates/${estimateId}/conversation`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

export interface GenerateResponse {
  runId: string;
  scopeSummary: string;
  assumptions: string[];
  sectionsCreated: number;
  lineItemsCreated: number;
}

export function useGenerateLineItems(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<GenerateResponse, AxiosError>({
    mutationFn: async () => {
      const res = await api.post<GenerateResponse>(
        `/api/estimates/${estimateId}/ai-runs`,
        { runType: 'GENERATE_LINE_ITEMS' },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKey(estimateId) });
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
    },
  });
}

export interface AskFollowupResponse {
  runId: string;
  assistantMessage: string;
  suggestedAction: 'none' | 'regenerate_line_items';
}

export function useAskFollowup(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<AskFollowupResponse, AxiosError, string>({
    mutationFn: async (userText: string) => {
      const res = await api.post<AskFollowupResponse>(
        `/api/estimates/${estimateId}/ai-runs`,
        { runType: 'ASK_FOLLOWUP', userText },
      );
      return res.data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: conversationKey(estimateId) });
    },
  });
}
