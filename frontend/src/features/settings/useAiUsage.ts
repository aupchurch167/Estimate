import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';

export interface UsageByUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  costUsd: string;
  runCount: number;
}

export interface UsageByEstimate {
  estimateId: string;
  number: string;
  title: string;
  costUsd: string;
  runCount: number;
}

export interface UsageDailyPoint {
  date: string;
  costUsd: string;
  runCount: number;
}

export type AiRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface UsageRecentRun {
  id: string;
  runType: string;
  status: AiRunStatus;
  modelVersion: string;
  costUsd: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  estimate: { id: string; number: string; title: string } | null;
  triggeredBy: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface AiUsagePayload {
  capUsd: string | null;
  monthToDateUsd: string;
  monthToDateRunCount: number;
  windowDays: number;
  byUser: UsageByUser[];
  byEstimate: UsageByEstimate[];
  dailySeries: UsageDailyPoint[];
  recentRuns: UsageRecentRun[];
}

export const AI_USAGE_QUERY_KEY = ['ai-usage'] as const;

export function useAiUsage(opts: { enabled?: boolean } = {}) {
  return useQuery<AiUsagePayload, AxiosError>({
    queryKey: AI_USAGE_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<AiUsagePayload>('/api/ai-runs/usage');
      return res.data;
    },
    enabled: opts.enabled ?? true,
    refetchOnWindowFocus: true,
  });
}
