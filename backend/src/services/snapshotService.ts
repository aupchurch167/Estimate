/**
 * Estimate snapshot service (Phase 4.4).
 *
 * Snapshots are immutable JSON copies of an estimate at key workflow
 * moments. They power the audit trail (what was approved, what was
 * sent) and back the PDF/XLSX exports without re-querying live tables.
 *
 * Triggers in this phase:
 *   - APPROVAL  → on reviewWorkflowService.approve  (IN_REVIEW → APPROVED)
 *   - REVISION  → on reviewWorkflowService.unlock   (APPROVED → REVISED)
 *   - SEND      → wired in Phase 4.5 (Send the estimate)
 *
 * The snapshot blob includes the estimate's denormalized header, all
 * active scope sections + line items, the active source inputs, and the
 * computed totals at the moment of the snapshot. Soft-deleted rows are
 * excluded — the snapshot represents what a reviewer or client would
 * actually see, not the audit-only history.
 *
 * Sequence is per-estimate (1, 2, 3, …) so the UI can label them
 * "v1 · APPROVAL", "v2 · REVISION", etc.
 */

import type { Prisma, EstimateSnapshot, SnapshotType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export interface SnapshotMeta {
  id: string;
  estimateId: string;
  snapshotType: SnapshotType;
  sequence: number;
  createdById: string;
  totalCost: string;
  totalMarkup: string;
  totalSellPrice: string;
  createdAt: Date;
}

type Tx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Build the deterministic JSON blob from a transaction-scoped Prisma
 * client. Caller is responsible for excluding any soft-deleted rows
 * (we already filter deletedAt: null below).
 */
async function buildSnapshotData(tx: Tx, estimateId: string) {
  const [estimate, scopeSections, lineItems, sourceInputs] = await Promise.all([
    tx.estimate.findUniqueOrThrow({ where: { id: estimateId } }),
    tx.scopeSection.findMany({
      where: { estimateId, deletedAt: null },
      orderBy: { order: 'asc' },
    }),
    tx.lineItem.findMany({
      where: { estimateId, deletedAt: null },
      orderBy: [{ scopeSectionId: 'asc' }, { order: 'asc' }],
    }),
    tx.sourceInput.findMany({
      where: { estimateId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { estimate, scopeSections, lineItems, sourceInputs };
}

/**
 * Take a snapshot inside an existing transaction. Returns the new row.
 * Callers in reviewWorkflowService use this to keep status update +
 * snapshot + ReviewAction atomic.
 */
export async function createSnapshotInTx(
  tx: Tx,
  args: {
    organizationId: string;
    estimateId: string;
    userId: string;
    snapshotType: SnapshotType;
  },
): Promise<EstimateSnapshot> {
  const data = await buildSnapshotData(tx, args.estimateId);
  if (data.estimate.organizationId !== args.organizationId) {
    throw new NotFoundError('Estimate', args.estimateId);
  }

  const last = await tx.estimateSnapshot.findFirst({
    where: { estimateId: args.estimateId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  return tx.estimateSnapshot.create({
    data: {
      organizationId: args.organizationId,
      estimateId: args.estimateId,
      snapshotType: args.snapshotType,
      sequence,
      createdById: args.userId,
      estimateData: data as unknown as Prisma.InputJsonValue,
      totalCost: data.estimate.totalCost,
      totalMarkup: data.estimate.totalMarkup,
      totalSellPrice: data.estimate.totalSellPrice,
    },
  });
}

/**
 * Standalone snapshot — runs its own transaction. Useful for tests and
 * for any future cron-style "snapshot daily" workflow.
 */
export async function createSnapshot(args: {
  organizationId: string;
  estimateId: string;
  userId: string;
  snapshotType: SnapshotType;
}): Promise<EstimateSnapshot> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: args.estimateId, organizationId: args.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', args.estimateId);
  return prisma.$transaction((tx) => createSnapshotInTx(tx, args));
}

/**
 * List snapshots for an estimate, newest first. Excludes the heavy
 * `estimateData` blob — call getSnapshot for the full payload (used by
 * the PDF/XLSX exporters).
 */
export async function listForEstimate(
  organizationId: string,
  estimateId: string,
): Promise<SnapshotMeta[]> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  const rows = await prisma.estimateSnapshot.findMany({
    where: { organizationId, estimateId },
    orderBy: { sequence: 'desc' },
    select: {
      id: true,
      estimateId: true,
      snapshotType: true,
      sequence: true,
      createdById: true,
      totalCost: true,
      totalMarkup: true,
      totalSellPrice: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    totalCost: r.totalCost.toString(),
    totalMarkup: r.totalMarkup.toString(),
    totalSellPrice: r.totalSellPrice.toString(),
  }));
}

export async function getSnapshot(
  organizationId: string,
  snapshotId: string,
): Promise<EstimateSnapshot> {
  const row = await prisma.estimateSnapshot.findFirst({
    where: { id: snapshotId, organizationId },
  });
  if (!row) throw new NotFoundError('EstimateSnapshot', snapshotId);
  return row;
}
