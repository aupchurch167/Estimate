import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { estimateDetailKey } from '@/features/estimates/useEstimates';
import type { ActivityEvent, Comment, ReviewAction } from './types';

export const reviewActionsKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'review-actions'] as const;
export const commentsKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'comments'] as const;
export const activityKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'activity'] as const;

// ─── Read queries ─────────────────────────────────────────────────────────

export function useReviewActions(estimateId: string | undefined) {
  return useQuery<{ reviewActions: ReviewAction[] }, AxiosError>({
    queryKey: estimateId ? reviewActionsKey(estimateId) : ['review-actions', '_'],
    queryFn: async () => {
      const res = await api.get<{ reviewActions: ReviewAction[] }>(
        `/api/estimates/${estimateId}/review-actions`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

export function useComments(estimateId: string | undefined) {
  return useQuery<{ comments: Comment[] }, AxiosError>({
    queryKey: estimateId ? commentsKey(estimateId) : ['comments', '_'],
    queryFn: async () => {
      const res = await api.get<{ comments: Comment[] }>(
        `/api/estimates/${estimateId}/comments`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

export function useActivity(estimateId: string | undefined) {
  return useQuery<{ events: ActivityEvent[] }, AxiosError>({
    queryKey: estimateId ? activityKey(estimateId) : ['activity', '_'],
    queryFn: async () => {
      const res = await api.get<{ events: ActivityEvent[] }>(
        `/api/estimates/${estimateId}/activity`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

// ─── Comment mutations ────────────────────────────────────────────────────

interface CreateCommentInput {
  body: string;
  lineItemId?: string | null;
  parentCommentId?: string | null;
  mentions?: string[];
}

export function useCreateComment(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<{ comment: Comment }, AxiosError, CreateCommentInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ comment: Comment }>(
        `/api/estimates/${estimateId}/comments`,
        input,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(estimateId) });
      qc.invalidateQueries({ queryKey: activityKey(estimateId) });
    },
  });
}

export function useResolveComment(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<
    { comment: Comment },
    AxiosError,
    { commentId: string; isResolved: boolean }
  >({
    mutationFn: async ({ commentId, isResolved }) => {
      const res = await api.patch<{ comment: Comment }>(
        `/api/estimates/${estimateId}/comments/${commentId}`,
        { isResolved },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(estimateId) });
      qc.invalidateQueries({ queryKey: activityKey(estimateId) });
    },
  });
}

export function useEditComment(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<
    { comment: Comment },
    AxiosError,
    { commentId: string; body: string; mentions?: string[] }
  >({
    mutationFn: async ({ commentId, body, mentions }) => {
      const res = await api.patch<{ comment: Comment }>(
        `/api/estimates/${estimateId}/comments/${commentId}`,
        { body, mentions },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(estimateId) });
    },
  });
}

export function useDeleteComment(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<void, AxiosError, { commentId: string }>({
    mutationFn: async ({ commentId }) => {
      await api.delete(`/api/estimates/${estimateId}/comments/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(estimateId) });
    },
  });
}

// ─── Review-workflow mutations (Phase 4.3 uses these) ─────────────────────

export interface TransitionResult {
  estimate: { id: string; status: string };
  reviewAction: ReviewAction;
}

type TransitionAction =
  | 'submit'
  | 'approve'
  | 'request-changes'
  | 'unlock'
  | 'mark-won'
  | 'mark-lost'
  | 'revise';

function review(estimateId: string, action: TransitionAction) {
  return async (body: Record<string, unknown> = {}) => {
    const res = await api.post<TransitionResult>(
      `/api/estimates/${estimateId}/${action}`,
      body,
    );
    return res.data;
  };
}

function transitionMutation(estimateId: string, action: TransitionAction) {
  return {
    mutationFn: review(estimateId, action),
    onSuccessKeys: [
      estimateDetailKey(estimateId),
      reviewActionsKey(estimateId),
      activityKey(estimateId),
    ],
  };
}

export function useSubmitForReview(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'submit');
  return useMutation<
    TransitionResult,
    AxiosError,
    { note?: string | null; reviewerId?: string | null } | void
  >({
    mutationFn: async (body) => cfg.mutationFn(body ?? {}),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useApproveEstimate(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'approve');
  return useMutation<TransitionResult, AxiosError, { note?: string | null } | void>({
    mutationFn: async (body) => cfg.mutationFn(body ?? {}),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useRequestChanges(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'request-changes');
  return useMutation<TransitionResult, AxiosError, { note: string }>({
    mutationFn: async (body) => cfg.mutationFn(body),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useUnlockEstimate(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'unlock');
  return useMutation<TransitionResult, AxiosError, { note?: string | null } | void>({
    mutationFn: async (body) => cfg.mutationFn(body ?? {}),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useMarkWon(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'mark-won');
  return useMutation<TransitionResult, AxiosError, { note?: string | null } | void>({
    mutationFn: async (body) => cfg.mutationFn(body ?? {}),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useMarkLost(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'mark-lost');
  return useMutation<
    TransitionResult,
    AxiosError,
    { lostReason: string; note?: string | null }
  >({
    mutationFn: async (body) => cfg.mutationFn(body),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useReviseFromSent(estimateId: string) {
  const qc = useQueryClient();
  const cfg = transitionMutation(estimateId, 'revise');
  return useMutation<TransitionResult, AxiosError, { note?: string | null } | void>({
    mutationFn: async (body) => cfg.mutationFn(body ?? {}),
    onSuccess: () => {
      cfg.onSuccessKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

// ─── Exports (Phase 4.5) ─────────────────────────────────────────────────

export interface ExportRow {
  id: string;
  estimateId: string;
  snapshotId: string;
  exportedById: string;
  format: 'PDF' | 'XLSX';
  fileSizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export interface SnapshotMeta {
  id: string;
  estimateId: string;
  snapshotType: 'APPROVAL' | 'SEND' | 'REVISION';
  sequence: number;
  createdById: string;
  totalCost: string;
  totalMarkup: string;
  totalSellPrice: string;
  createdAt: string;
}

export const exportsKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'exports'] as const;
export const snapshotsKey = (estimateId: string) =>
  ['estimates', 'detail', estimateId, 'snapshots'] as const;

export function useExports(estimateId: string | undefined) {
  return useQuery<{ exports: ExportRow[] }, AxiosError>({
    queryKey: estimateId ? exportsKey(estimateId) : ['exports', '_'],
    queryFn: async () => {
      const res = await api.get<{ exports: ExportRow[] }>(
        `/api/estimates/${estimateId}/exports`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

export function useSnapshots(estimateId: string | undefined) {
  return useQuery<{ snapshots: SnapshotMeta[] }, AxiosError>({
    queryKey: estimateId ? snapshotsKey(estimateId) : ['snapshots', '_'],
    queryFn: async () => {
      const res = await api.get<{ snapshots: SnapshotMeta[] }>(
        `/api/estimates/${estimateId}/snapshots`,
      );
      return res.data;
    },
    enabled: Boolean(estimateId),
  });
}

interface ExportInput {
  format?: 'PDF' | 'XLSX';
  snapshotId?: string | null;
}

export type SendMethod = 'email' | 'link' | 'download';

export interface SendEstimateInput {
  sendMethod?: SendMethod;
  recipients?: string[];
  subject?: string | null;
  message?: string | null;
}

export interface SendEstimateResult {
  estimate: { id: string; status: string; sentAt: string | null };
  snapshotId: string;
  exportId: string;
  sendMethod: SendMethod;
  downloadUrl: string;
  email: { dispatched: boolean; reason?: string } | null;
}

export function useSendEstimate(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<SendEstimateResult, AxiosError, SendEstimateInput>({
    mutationFn: async (body) => {
      const res = await api.post<SendEstimateResult>(
        `/api/estimates/${estimateId}/send`,
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateDetailKey(estimateId) });
      qc.invalidateQueries({ queryKey: snapshotsKey(estimateId) });
      qc.invalidateQueries({ queryKey: exportsKey(estimateId) });
      qc.invalidateQueries({ queryKey: activityKey(estimateId) });
    },
  });
}

export interface CreateExportResult {
  export: ExportRow;
  downloadUrl: string;
}

export function useCreateExport(estimateId: string) {
  const qc = useQueryClient();
  return useMutation<CreateExportResult, AxiosError, ExportInput | void>({
    mutationFn: async (body) => {
      const res = await api.post<CreateExportResult>(
        `/api/estimates/${estimateId}/exports`,
        { format: 'PDF', ...(body ?? {}) },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportsKey(estimateId) });
      qc.invalidateQueries({ queryKey: activityKey(estimateId) });
    },
  });
}
