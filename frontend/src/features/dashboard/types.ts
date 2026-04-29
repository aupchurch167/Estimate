import type { EstimateStatus } from '@/features/estimates/types';

export interface PipelineSummary {
  counts: Record<EstimateStatus, number>;
  totalApprovedSellPrice: string;
  totalSentSellPrice: string;
  wonThisMonthSellPrice: string;
  wonThisMonthCount: number;
  winRate: number | null;
  avgDaysInPipeline: number | null;
  activePipelineValue: string;
}

export interface DashboardEstimateRow {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  clientCompanyName: string | null;
  totalSellPrice: string;
  updatedAt: string;
  drafter: { id: string; firstName: string; lastName: string } | null;
  reviewer: { id: string; firstName: string; lastName: string } | null;
}

export type NeedsAttentionReason =
  | 'my_draft'
  | 'my_revised'
  | 'awaiting_my_review'
  | 'stale_in_flight';

export interface NeedsAttentionItem {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  clientCompanyName: string | null;
  totalSellPrice: string;
  updatedAt: string;
  reason: NeedsAttentionReason;
  ageDays: number;
}

export interface DashboardActivityRow {
  id: string;
  eventType: string;
  summary: string;
  createdAt: string;
  estimate: { id: string; number: string } | null;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export interface AiUsageByUserRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  runCount: number;
  costUsd: string;
}

export interface AiUsagePayload {
  monthToDateUsd: string;
  monthToDateRunCount: number;
  capUsd: string | null;
  byUser: AiUsageByUserRow[];
}

export interface DashboardPayload {
  pipeline: PipelineSummary;
  needsAttention: NeedsAttentionItem[];
  assignedReviews: DashboardEstimateRow[];
  myDrafts: DashboardEstimateRow[];
  recentActivity: DashboardActivityRow[];
  aiUsage: AiUsagePayload | null;
}
