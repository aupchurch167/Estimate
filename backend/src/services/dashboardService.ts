/**
 * Dashboard service (Phase 5.1).
 *
 * Aggregates the org-wide and per-user numbers that power the landing
 * page:
 *
 *   - pipeline: counts of estimates by status, plus dollar totals for
 *     APPROVED + SENT + won-this-month.
 *   - assignedReviews: estimates IN_REVIEW where the viewer is the
 *     reviewer.
 *   - myDrafts: DRAFT or REVISED estimates where the viewer is the
 *     drafter.
 *   - recentActivity: the last N ActivityEvent rows org-wide, joined
 *     with actor name + estimate number for display.
 *
 * Single round-trip query per panel; nothing heavy. Pipeline counts
 * use a single raw `groupBy` so we stay one query for the bulk of the
 * data.
 */

import type { Estimate, EstimateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { canManageOrg } from '../lib/permissions.js';
import { getUsageForOrg, type AiUsagePayload } from './aiUsageService.js';
import { logger } from '../lib/logger.js';

const RECENT_ACTIVITY_LIMIT = 12;
const PER_LIST_LIMIT = 8;
const NEEDS_ATTENTION_LIMIT = 10;
/** Days of inactivity that flag an in-flight estimate as overdue. */
const STALE_DAYS = 5;

export interface PipelineSummary {
  counts: Record<EstimateStatus, number>;
  totalApprovedSellPrice: string;
  totalSentSellPrice: string;
  wonThisMonthSellPrice: string;
  wonThisMonthCount: number;
  /** WON / (WON + LOST) over all time, 0..1. Null when neither group has any. */
  winRate: number | null;
  /** Average DAYS between createdAt and a terminal status (WON/LOST). Null when no terminal estimates. */
  avgDaysInPipeline: number | null;
  /** Sum of totalSellPrice across DRAFT|IN_REVIEW|APPROVED|SENT|REVISED — what's "in flight". */
  activePipelineValue: string;
}

export type EstimateRowSlim = Pick<
  Estimate,
  | 'id'
  | 'number'
  | 'title'
  | 'status'
  | 'clientCompanyName'
  | 'totalSellPrice'
  | 'updatedAt'
> & {
  drafter: { id: string; firstName: string; lastName: string } | null;
  reviewer: { id: string; firstName: string; lastName: string } | null;
};

export interface NeedsAttentionItem {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  clientCompanyName: string | null;
  totalSellPrice: string;
  updatedAt: Date;
  /** Why we surfaced this — drives the CTA copy. */
  reason: 'my_draft' | 'my_revised' | 'awaiting_my_review' | 'stale_in_flight';
  /** Days since updatedAt — useful to show "5d ago" badges. */
  ageDays: number;
}

export interface DashboardPayload {
  pipeline: PipelineSummary;
  needsAttention: NeedsAttentionItem[];
  assignedReviews: EstimateRowSlim[];
  myDrafts: EstimateRowSlim[];
  recentActivity: {
    id: string;
    eventType: string;
    summary: string;
    createdAt: Date;
    estimate: { id: string; number: string } | null;
    actor: { id: string; firstName: string; lastName: string } | null;
  }[];
  /** Admin-only AI usage rollup. Null for non-admins. */
  aiUsage: AiUsagePayload | null;
}

const ALL_STATUSES: EstimateStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT',
  'WON',
  'LOST',
  'REVISED',
];

function startOfCurrentMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const slimSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  clientCompanyName: true,
  totalSellPrice: true,
  updatedAt: true,
  drafter: { select: { id: true, firstName: true, lastName: true } },
  reviewer: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function loadDashboard(
  organizationId: string,
  viewer: { id: string; role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER' },
): Promise<DashboardPayload> {
  const viewerId = viewer.id;
  const isAdmin = canManageOrg(viewer.role);
  const staleSince = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const inFlight: EstimateStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'REVISED'];

  const [
    grouped,
    approvedAgg,
    sentAgg,
    wonAgg,
    activeAgg,
    wonAllTime,
    lostAllTime,
    pipelineDurations,
    assignedReviews,
    myDrafts,
    myRevised,
    staleInFlight,
    recentActivity,
  ] = await Promise.all([
    prisma.estimate.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.estimate.aggregate({
      where: { organizationId, deletedAt: null, status: 'APPROVED' },
      _sum: { totalSellPrice: true },
    }),
    prisma.estimate.aggregate({
      where: { organizationId, deletedAt: null, status: 'SENT' },
      _sum: { totalSellPrice: true },
    }),
    prisma.estimate.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: 'WON',
        wonAt: { gte: startOfCurrentMonth() },
      },
      _sum: { totalSellPrice: true },
      _count: { _all: true },
    }),
    prisma.estimate.aggregate({
      where: { organizationId, deletedAt: null, status: { in: inFlight } },
      _sum: { totalSellPrice: true },
    }),
    prisma.estimate.count({
      where: { organizationId, deletedAt: null, status: 'WON' },
    }),
    prisma.estimate.count({
      where: { organizationId, deletedAt: null, status: 'LOST' },
    }),
    prisma.estimate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { status: 'WON', wonAt: { not: null } },
          { status: 'LOST', lostAt: { not: null } },
        ],
      },
      select: { createdAt: true, wonAt: true, lostAt: true, status: true },
    }),
    prisma.estimate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        reviewerId: viewerId,
        status: 'IN_REVIEW',
      },
      orderBy: { updatedAt: 'desc' },
      take: PER_LIST_LIMIT,
      select: slimSelect,
    }),
    prisma.estimate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        drafterId: viewerId,
        status: 'DRAFT',
      },
      orderBy: { updatedAt: 'desc' },
      take: PER_LIST_LIMIT,
      select: slimSelect,
    }),
    prisma.estimate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        drafterId: viewerId,
        status: 'REVISED',
      },
      orderBy: { updatedAt: 'desc' },
      take: PER_LIST_LIMIT,
      select: slimSelect,
    }),
    // Admins see stale in-flight estimates org-wide; non-admins see their own.
    prisma.estimate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['IN_REVIEW', 'APPROVED'] },
        updatedAt: { lt: staleSince },
        ...(isAdmin
          ? {}
          : {
              OR: [{ drafterId: viewerId }, { reviewerId: viewerId }],
            }),
      },
      orderBy: { updatedAt: 'asc' },
      take: PER_LIST_LIMIT,
      select: slimSelect,
    }),
    prisma.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        eventType: true,
        summary: true,
        createdAt: true,
        estimate: { select: { id: true, number: true } },
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const counts = ALL_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<EstimateStatus, number>,
  );
  for (const row of grouped) counts[row.status] = row._count._all;

  const totalTerminal = wonAllTime + lostAllTime;
  const winRate = totalTerminal === 0 ? null : wonAllTime / totalTerminal;

  let avgDaysInPipeline: number | null = null;
  if (pipelineDurations.length > 0) {
    const dayMs = 24 * 60 * 60 * 1000;
    const sum = pipelineDurations.reduce((acc, e) => {
      const end = e.status === 'WON' ? e.wonAt : e.lostAt;
      if (!end) return acc;
      return acc + (end.getTime() - e.createdAt.getTime());
    }, 0);
    avgDaysInPipeline = Math.round((sum / pipelineDurations.length / dayMs) * 10) / 10;
  }

  const pipeline: PipelineSummary = {
    counts,
    totalApprovedSellPrice: (approvedAgg._sum.totalSellPrice ?? '0').toString(),
    totalSentSellPrice: (sentAgg._sum.totalSellPrice ?? '0').toString(),
    wonThisMonthSellPrice: (wonAgg._sum.totalSellPrice ?? '0').toString(),
    wonThisMonthCount: wonAgg._count._all,
    winRate,
    avgDaysInPipeline,
    activePipelineValue: (activeAgg._sum.totalSellPrice ?? '0').toString(),
  };

  const now = Date.now();
  const ageDays = (d: Date): number => Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000));
  const toItem = (
    rows: typeof assignedReviews,
    reason: NeedsAttentionItem['reason'],
  ): NeedsAttentionItem[] =>
    rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      clientCompanyName: r.clientCompanyName,
      totalSellPrice: r.totalSellPrice.toString(),
      updatedAt: r.updatedAt,
      reason,
      ageDays: ageDays(r.updatedAt),
    }));

  // Sort priority: revised changes wanted (drafter must act) > review queue >
  // your drafts > stale in-flight. Within each bucket, oldest first.
  const seen = new Set<string>();
  const needsAttention: NeedsAttentionItem[] = [];
  for (const item of [
    ...toItem(myRevised, 'my_revised'),
    ...toItem(assignedReviews, 'awaiting_my_review'),
    ...toItem(myDrafts, 'my_draft'),
    ...toItem(staleInFlight, 'stale_in_flight'),
  ]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    needsAttention.push(item);
    if (needsAttention.length >= NEEDS_ATTENTION_LIMIT) break;
  }

  let aiUsage: AiUsagePayload | null = null;
  if (isAdmin) {
    try {
      aiUsage = await getUsageForOrg(organizationId);
    } catch (err) {
      // Non-fatal — the rest of the dashboard still loads.
      logger.warn({ err, organizationId }, '[dashboard] aiUsage lookup failed');
    }
  }

  return {
    pipeline,
    needsAttention,
    assignedReviews: assignedReviews.map(rowToSlim),
    myDrafts: [...myDrafts, ...myRevised].slice(0, PER_LIST_LIMIT).map(rowToSlim),
    recentActivity,
    aiUsage,
  };
}

function rowToSlim(r: {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  clientCompanyName: string | null;
  totalSellPrice: { toString(): string };
  updatedAt: Date;
  drafter: { id: string; firstName: string; lastName: string } | null;
  reviewer: { id: string; firstName: string; lastName: string } | null;
}): EstimateRowSlim {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    clientCompanyName: r.clientCompanyName,
    totalSellPrice: r.totalSellPrice.toString() as unknown as Estimate['totalSellPrice'],
    updatedAt: r.updatedAt,
    drafter: r.drafter,
    reviewer: r.reviewer,
  };
}
