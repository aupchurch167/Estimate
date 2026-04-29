/**
 * AI usage analytics (Phase 5.2).
 *
 * Powers the admin-facing "AI usage" panel: month-to-date spend
 * against the cap, top contributors, top estimates, last-30-day
 * timeseries, and the most recent runs (including FAILED ones with
 * their error messages so admins can debug without grepping logs).
 */

import type { AIRunStatus, AIRunType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

const RECENT_RUNS_LIMIT = 25;
const TOP_LIMIT = 5;
const SERIES_DAYS = 30;

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
  date: string; // YYYY-MM-DD UTC
  costUsd: string;
  runCount: number;
}

export interface UsageRecentRun {
  id: string;
  runType: AIRunType;
  status: AIRunStatus;
  modelVersion: string;
  costUsd: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
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

function startOfCurrentMonthUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfWindow(now: Date = new Date(), days = SERIES_DAYS): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export async function getUsageForOrg(organizationId: string): Promise<AiUsagePayload> {
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { monthlyAiCostCapUsd: true },
  });
  if (!settings) throw new NotFoundError('OrgSettings', organizationId);

  const monthStart = startOfCurrentMonthUTC();
  const windowStart = startOfWindow();

  // Month-to-date totals (counts both SUCCEEDED and FAILED — both
  // consumed tokens and bill the cap).
  const mtd = await prisma.aIRun.aggregate({
    where: {
      organizationId,
      status: { in: ['SUCCEEDED', 'FAILED'] },
      createdAt: { gte: monthStart },
    },
    _sum: { costUsd: true },
    _count: { _all: true },
  });

  const [byUserRaw, byEstimateRaw, dailyRaw, recentRuns] = await Promise.all([
    prisma.aIRun.groupBy({
      by: ['triggeredById'],
      where: {
        organizationId,
        status: { in: ['SUCCEEDED', 'FAILED'] },
        createdAt: { gte: windowStart },
      },
      _sum: { costUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: 'desc' } },
      take: TOP_LIMIT,
    }),
    prisma.aIRun.groupBy({
      by: ['estimateId'],
      where: {
        organizationId,
        status: { in: ['SUCCEEDED', 'FAILED'] },
        createdAt: { gte: windowStart },
      },
      _sum: { costUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: 'desc' } },
      take: TOP_LIMIT,
    }),
    // Per-day rollup. Postgres date_trunc gives us a clean series we
    // pad with zeros below so the chart isn't a sparse mess.
    prisma.$queryRaw<{ day: Date; cost: string | null; runs: bigint }[]>`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM("costUsd") AS cost,
        COUNT(*) AS runs
      FROM "AIRun"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('SUCCEEDED', 'FAILED')
        AND "createdAt" >= ${windowStart}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.aIRun.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_RUNS_LIMIT,
      select: {
        id: true,
        runType: true,
        status: true,
        modelVersion: true,
        costUsd: true,
        tokensInput: true,
        tokensOutput: true,
        durationMs: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
        estimate: { select: { id: true, number: true, title: true } },
        triggeredBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
  ]);

  // Resolve user + estimate metadata for the top-N rollups.
  const userIds = byUserRaw.map((r) => r.triggeredById);
  const estimateIds = byEstimateRaw.map((r) => r.estimateId);
  const [users, estimates] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    estimateIds.length > 0
      ? prisma.estimate.findMany({
          where: { id: { in: estimateIds } },
          select: { id: true, number: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const estimateById = new Map(estimates.map((e) => [e.id, e]));

  const byUser: UsageByUser[] = byUserRaw.flatMap((r) => {
    const u = userById.get(r.triggeredById);
    if (!u) return [];
    return [
      {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        costUsd: (r._sum.costUsd ?? '0').toString(),
        runCount: r._count._all,
      },
    ];
  });

  const byEstimate: UsageByEstimate[] = byEstimateRaw.flatMap((r) => {
    const e = estimateById.get(r.estimateId);
    if (!e) return [];
    return [
      {
        estimateId: e.id,
        number: e.number,
        title: e.title,
        costUsd: (r._sum.costUsd ?? '0').toString(),
        runCount: r._count._all,
      },
    ];
  });

  const dailySeries = padDailySeries(dailyRaw, windowStart, SERIES_DAYS);
  const recent: UsageRecentRun[] = recentRuns.map((r) => ({
    ...r,
    costUsd: r.costUsd === null ? null : r.costUsd.toString(),
  }));

  return {
    capUsd: settings.monthlyAiCostCapUsd?.toString() ?? null,
    monthToDateUsd: (mtd._sum.costUsd ?? '0').toString(),
    monthToDateRunCount: mtd._count._all,
    windowDays: SERIES_DAYS,
    byUser,
    byEstimate,
    dailySeries,
    recentRuns: recent,
  };
}

function padDailySeries(
  raw: { day: Date; cost: string | null; runs: bigint }[],
  start: Date,
  days: number,
): UsageDailyPoint[] {
  const bucket = new Map<string, { costUsd: string; runCount: number }>();
  for (const row of raw) {
    const key = row.day.toISOString().slice(0, 10);
    bucket.set(key, {
      costUsd: (row.cost ?? '0').toString(),
      runCount: Number(row.runs),
    });
  }
  const out: UsageDailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const hit = bucket.get(key);
    out.push({
      date: key,
      costUsd: hit?.costUsd ?? '0',
      runCount: hit?.runCount ?? 0,
    });
  }
  return out;
}
