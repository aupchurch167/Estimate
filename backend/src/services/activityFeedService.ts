/**
 * Activity feed service.
 *
 * Reads ActivityEvent rows for a single estimate or org-wide, newest
 * first. Joins the actor (User) and the estimate so the UI can render
 * "Adam · 12:34 PM · Submitted for review on MAC-26-001" without an
 * extra round-trip.
 *
 * Cursor pagination via `cursor` (an event id) keeps the feed stable
 * when new events arrive between fetches — offset pagination would skip
 * or duplicate rows when newer events land at the head.
 */

import type { ActivityEvent } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export type ActivityEventWithActor = ActivityEvent & {
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  estimate: { id: string; number: string; title: string } | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListOptions {
  /** Page size; 1..MAX_LIMIT, default 50. */
  limit?: number;
  /** Last id from the previous page; results return events strictly older. */
  cursor?: string | null;
}

export interface ListResult {
  events: ActivityEventWithActor[];
  nextCursor: string | null;
}

const includeShape = {
  actor: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  estimate: {
    select: { id: true, number: true, title: true },
  },
} as const;

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MAX_LIMIT, limit ?? DEFAULT_LIMIT));
}

export async function listForEstimate(
  organizationId: string,
  estimateId: string,
  opts: ListOptions = {},
): Promise<ListResult> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);

  const take = clampLimit(opts.limit);
  const events = await prisma.activityEvent.findMany({
    where: { organizationId, estimateId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    take: take + 1,
    include: includeShape,
  });
  const hasMore = events.length > take;
  const page = hasMore ? events.slice(0, take) : events;
  return {
    events: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function listForOrganization(
  organizationId: string,
  opts: ListOptions = {},
): Promise<ListResult> {
  const take = clampLimit(opts.limit);
  const events = await prisma.activityEvent.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    take: take + 1,
    include: includeShape,
  });
  const hasMore = events.length > take;
  const page = hasMore ? events.slice(0, take) : events;
  return {
    events: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}
