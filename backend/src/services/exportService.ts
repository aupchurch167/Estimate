/**
 * Estimate export orchestration (Phase 4.5).
 *
 * Exports are bound to an immutable EstimateSnapshot — the schema FK
 * enforces it. So every export:
 *   1. Resolves an EstimateSnapshot (caller-provided id, or the latest
 *      snapshot for this estimate).
 *   2. Renders the PDF from the snapshot's frozen JSON blob.
 *   3. Uploads the bytes to Spaces under a deterministic key.
 *   4. Writes an EstimateExport row with file size + signed-URL key.
 *   5. Writes an ESTIMATE_EXPORTED activity event.
 *
 * If no snapshot exists yet, the caller gets a 409
 * `no_snapshot_to_export` so the UI can surface "Approve first".
 */

import type { EstimateExport, ExportFormat } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  generateSignedDownloadUrl,
  uploadBuffer,
} from '../lib/spaces.js';
import { renderEstimatePdf, type PdfEstimateData } from './pdfService.js';

const SIGNED_DOWNLOAD_EXPIRES_SECONDS = 60 * 60 * 24; // 24h

export interface CreateExportArgs {
  organizationId: string;
  userId: string;
  estimateId: string;
  format: ExportFormat;
  /** Specific snapshot to export. Defaults to latest. */
  snapshotId?: string | null;
}

export interface CreateExportResult {
  export: EstimateExport;
  downloadUrl: string;
}

export async function createExport(args: CreateExportArgs): Promise<CreateExportResult> {
  if (args.format !== 'PDF') {
    throw new ConflictError(
      'Only PDF export is supported in this phase',
      'unsupported_export_format',
      { format: args.format },
    );
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: args.estimateId, organizationId: args.organizationId, deletedAt: null },
    include: { organization: { select: { name: true } } },
  });
  if (!estimate) throw new NotFoundError('Estimate', args.estimateId);

  const snapshot = args.snapshotId
    ? await prisma.estimateSnapshot.findFirst({
        where: {
          id: args.snapshotId,
          organizationId: args.organizationId,
          estimateId: args.estimateId,
        },
      })
    : await prisma.estimateSnapshot.findFirst({
        where: { organizationId: args.organizationId, estimateId: args.estimateId },
        orderBy: { sequence: 'desc' },
      });
  if (!snapshot) {
    throw new ConflictError(
      'No snapshot to export — approve the estimate first.',
      'no_snapshot_to_export',
      { estimateId: args.estimateId },
    );
  }

  const data = snapshot.estimateData as unknown as PdfEstimateData;
  const buffer = await renderEstimatePdf(data, {
    organizationName: estimate.organization.name,
    snapshotLabel: `v${snapshot.sequence} · ${snapshot.snapshotType}`,
  });

  const key = `exports/${args.organizationId}/${estimate.id}/${snapshot.id}/${Date.now()}.pdf`;
  await uploadBuffer({
    key,
    body: buffer,
    contentType: 'application/pdf',
    acl: 'private',
  });

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.estimateExport.create({
      data: {
        organizationId: args.organizationId,
        estimateId: estimate.id,
        snapshotId: snapshot.id,
        exportedById: args.userId,
        format: args.format,
        fileUrl: key,
        fileSizeBytes: buffer.length,
      },
    });
    await tx.activityEvent.create({
      data: {
        organizationId: args.organizationId,
        actorId: args.userId,
        eventType: 'ESTIMATE_EXPORTED',
        entityType: 'EstimateExport',
        entityId: row.id,
        estimateId: estimate.id,
        summary: `Exported ${args.format} (v${snapshot.sequence})`,
        meta: {
          exportId: row.id,
          snapshotId: snapshot.id,
          format: args.format,
          fileSizeBytes: buffer.length,
        },
      },
    });
    return row;
  });

  const downloadUrl = await generateSignedDownloadUrl({
    key: result.fileUrl,
    expiresIn: SIGNED_DOWNLOAD_EXPIRES_SECONDS,
  });
  return { export: result, downloadUrl };
}

export interface ExportListItem {
  id: string;
  estimateId: string;
  snapshotId: string;
  exportedById: string;
  format: ExportFormat;
  fileSizeBytes: number;
  createdAt: Date;
  downloadUrl: string;
}

export async function listForEstimate(
  organizationId: string,
  estimateId: string,
): Promise<ExportListItem[]> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  const rows = await prisma.estimateExport.findMany({
    where: { organizationId, estimateId },
    orderBy: { createdAt: 'desc' },
  });
  const out: ExportListItem[] = [];
  for (const r of rows) {
    const downloadUrl = await generateSignedDownloadUrl({
      key: r.fileUrl,
      expiresIn: SIGNED_DOWNLOAD_EXPIRES_SECONDS,
    });
    out.push({
      id: r.id,
      estimateId: r.estimateId,
      snapshotId: r.snapshotId,
      exportedById: r.exportedById,
      format: r.format,
      fileSizeBytes: r.fileSizeBytes,
      createdAt: r.createdAt,
      downloadUrl,
    });
  }
  return out;
}
