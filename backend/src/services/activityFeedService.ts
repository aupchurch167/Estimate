/**
 * Activity feed service (Phase 4.2).
 *
 * Reads ActivityEvent rows for a single estimate, newest first. Joins
 * the actor (User) so the UI can render "Adam · 12:34 PM · Submitted
 * for review" without an extra round-trip.
 */

import type { ActivityEvent } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export type ActivityEventWithActor = ActivityEvent & {
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function listForEstimate(
  organizationId: string,
  estimateId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ActivityEventWithActor[]> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);

  const take = Math.max(1, Math.min(MAX_LIMIT, limit));
  return prisma.activityEvent.findMany({
    where: { organizationId, estimateId },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}
