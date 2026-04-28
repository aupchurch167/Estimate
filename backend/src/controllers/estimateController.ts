/**
 * Estimate HTTP controllers.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as estimateService from '../services/estimateService.js';
import * as reviewWorkflowService from '../services/reviewWorkflowService.js';
import * as snapshotService from '../services/snapshotService.js';
import * as exportService from '../services/exportService.js';
import * as sendService from '../services/sendService.js';
import { canCreateEstimate } from '../lib/permissions.js';
import { ConflictError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

const STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'WON', 'LOST', 'REVISED'] as const;

const createBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  clientCompanyName: z.string().max(200).nullable().optional(),
  clientContactName: z.string().max(200).nullable().optional(),
  clientContactEmail: z
    .union([z.string().email(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  clientContactPhone: z.string().max(40).nullable().optional(),
  projectAddressLine1: z.string().max(200).nullable().optional(),
  projectAddressLine2: z.string().max(200).nullable().optional(),
  projectCity: z.string().max(80).nullable().optional(),
  projectState: z.string().max(40).nullable().optional(),
  projectPostalCode: z.string().max(20).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  reviewerId: z.string().min(1).nullable().optional(),
});

const patchBody = createBody.partial();

const listQuery = z.object({
  status: z
    .union([z.enum(STATUSES), z.array(z.enum(STATUSES))])
    .optional(),
  drafterId: z.string().min(1).optional(),
  reviewerId: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.enum(['updatedAt', 'createdAt', 'number', 'totalSellPrice']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function assertOrg(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return { orgId: req.organization.id, user: req.user };
}

// Express's qs sometimes parses ?status=A&status=B as a string array; sometimes
// it leaves single values as strings. Normalize ahead of Zod.
function normalizeStatusParam(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.includes(',')) return raw.split(',');
  return raw;
}

export async function listEstimates(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const q = parse(listQuery, {
    ...req.query,
    status: normalizeStatusParam(req.query.status),
  });
  const result = await estimateService.list(orgId, {
    status: q.status,
    drafterId: q.drafterId,
    reviewerId: q.reviewerId,
    search: q.search,
    page: q.page,
    pageSize: q.limit,
    sort: q.sort,
    order: q.order,
  });
  res.status(200).json(result);
}

export async function createEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  if (!canCreateEstimate(user.role)) {
    throw new ForbiddenError('Your role cannot create estimates');
  }
  const input = parse(createBody, req.body);
  const estimate = await estimateService.create(orgId, user.id, input);
  res.status(201).json({ estimate });
}

export async function getEstimate(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const estimate = await estimateService.getById(orgId, String(req.params.id ?? ''));
  ok(res, { estimate });
}

export async function patchEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(patchBody, req.body);
  const estimate = await estimateService.update(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { estimate });
}

export async function deleteEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  await estimateService.softDelete(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
  );
  res.status(204).end();
}

// ─── Review-workflow transitions (Phase 4.1) ─────────────────────────────

const optionalNoteBody = z
  .object({
    note: z.string().max(2000).nullable().optional(),
    reviewerId: z.string().min(1).nullable().optional(),
  })
  .optional()
  .default({});

const requiredNoteBody = z.object({
  note: z.string().min(1, 'Required').max(2000),
});

export async function submitForReview(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(optionalNoteBody, req.body ?? {});
  const result = await reviewWorkflowService.submitForReview(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    { note: input.note, reviewerId: input.reviewerId },
  );
  res.status(200).json(result);
}

export async function approveEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(optionalNoteBody, req.body ?? {});
  const result = await reviewWorkflowService.approve(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    { note: input.note },
  );
  res.status(200).json(result);
}

export async function requestChanges(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(requiredNoteBody, req.body ?? {});
  const result = await reviewWorkflowService.requestChanges(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    { note: input.note },
  );
  res.status(200).json(result);
}

export async function unlockEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(optionalNoteBody, req.body ?? {});
  const result = await reviewWorkflowService.unlock(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    { note: input.note },
  );
  res.status(200).json(result);
}

export async function listReviewActions(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const reviewActions = await reviewWorkflowService.listReviewActions(
    orgId,
    String(req.params.id ?? ''),
  );
  ok(res, { reviewActions });
}

// ─── Snapshots (Phase 4.4) ───────────────────────────────────────────────

export async function listSnapshots(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const snapshots = await snapshotService.listForEstimate(
    orgId,
    String(req.params.id ?? ''),
  );
  ok(res, { snapshots });
}

export async function getSnapshot(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const snapshot = await snapshotService.getSnapshot(
    orgId,
    String(req.params.snapshotId ?? ''),
  );
  ok(res, { snapshot });
}

// ─── Exports (Phase 4.5) ─────────────────────────────────────────────────

const exportBody = z.object({
  format: z.enum(['PDF', 'XLSX']).default('PDF'),
  snapshotId: z.string().min(1).nullable().optional(),
});

export async function createExport(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(exportBody, req.body ?? {});
  try {
    const result = await exportService.createExport({
      organizationId: orgId,
      userId: user.id,
      estimateId: String(req.params.id ?? ''),
      format: input.format,
      snapshotId: input.snapshotId ?? null,
    });
    res.status(201).json({
      export: result.export,
      downloadUrl: result.downloadUrl,
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    throw err;
  }
}

export async function listExports(req: Request, res: Response): Promise<void> {
  const { orgId } = assertOrg(req);
  const exports = await exportService.listForEstimate(
    orgId,
    String(req.params.id ?? ''),
  );
  ok(res, { exports });
}

// ─── Send (Phase 4.6) ────────────────────────────────────────────────────

const sendBody = z.object({
  recipients: z.array(z.string().min(1)).min(1).max(10),
  subject: z.string().max(200).nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
});

export async function sendEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = assertOrg(req);
  const input = parse(sendBody, req.body ?? {});
  try {
    const result = await sendService.sendEstimate(
      orgId,
      { id: user.id, role: user.role },
      String(req.params.id ?? ''),
      {
        recipients: input.recipients,
        subject: input.subject ?? null,
        message: input.message ?? null,
      },
    );
    res.status(200).json({
      estimate: result.estimate,
      snapshotId: result.snapshot.id,
      exportId: result.exportId,
      email: result.email,
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    throw err;
  }
}
