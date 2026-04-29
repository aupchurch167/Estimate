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

const RECENT_ACTIVITY_LIMIT = 12;
const PER_LIST_LIMIT = 8;

export interface PipelineSummary {
  counts: Record<EstimateStatus, number>;
  totalApprovedSellPrice: string;
  totalSentSellPrice: string;
  wonThisMonthSellPrice: string;
  wonThisMonthCount: number;
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

export interface DashboardPayload {
  pipeline: PipelineSummary;
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
  viewerId: string,
): Promise<DashboardPayload> {
  const [
    grouped,
    approvedAgg,
    sentAgg,
    wonAgg,
    assignedReviews,
    myDrafts,
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
        status: { in: ['DRAFT', 'REVISED'] },
      },
      orderBy: { updatedAt: 'desc' },
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

  const pipeline: PipelineSummary = {
    counts,
    totalApprovedSellPrice: (approvedAgg._sum.totalSellPrice ?? '0').toString(),
    totalSentSellPrice: (sentAgg._sum.totalSellPrice ?? '0').toString(),
    wonThisMonthSellPrice: (wonAgg._sum.totalSellPrice ?? '0').toString(),
    wonThisMonthCount: wonAgg._count._all,
  };

  return {
    pipeline,
    assignedReviews: assignedReviews.map(rowToSlim),
    myDrafts: myDrafts.map(rowToSlim),
    recentActivity,
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
