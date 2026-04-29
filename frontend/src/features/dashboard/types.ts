import type { EstimateStatus } from '@/features/estimates/types';

export interface PipelineSummary {
  counts: Record<EstimateStatus, number>;
  totalApprovedSellPrice: string;
  totalSentSellPrice: string;
  wonThisMonthSellPrice: string;
  wonThisMonthCount: number;
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

export interface DashboardActivityRow {
  id: string;
  eventType: string;
  summary: string;
  createdAt: string;
  estimate: { id: string; number: string } | null;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export interface DashboardPayload {
  pipeline: PipelineSummary;
  assignedReviews: DashboardEstimateRow[];
  myDrafts: DashboardEstimateRow[];
  recentActivity: DashboardActivityRow[];
}
