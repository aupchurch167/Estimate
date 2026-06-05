import type { Request, Response } from 'express';
import { z } from 'zod';
import * as bidResponseService from '../services/bidResponseService.js';
import { NotFoundError } from '../lib/errors.js';
import { ok, created } from '../lib/response.js';

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().max(20).optional(),
  unitPrice: z.number().nonnegative().optional(),
  totalPrice: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

const submitBody = z.object({
  totalAmount: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  lineItems: z.array(lineItemSchema).max(200).optional(),
});

const submissionSourceEnum = z.enum(['PORTAL', 'EMAIL', 'MANUAL']);

const manualSubmitBody = z.object({
  bidRequestId: z.string().min(1),
  submissionSource: submissionSourceEnum.default('MANUAL'),
  totalAmount: z.number().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  lineItems: z.array(lineItemSchema).max(200).optional(),
});

const addAttachmentBody = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
});

const addDocumentBody = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
});

// ─── Internal (authenticated) endpoints ─────────────────────────────────────

export async function listByPackage(req: Request, res: Response) {
  const responses = await bidResponseService.listByBidPackage(
    String(req.params.packageId),
    req.user!.organizationId,
  );
  return ok(res, responses);
}

export async function manualSubmit(req: Request, res: Response) {
  const body = manualSubmitBody.parse(req.body);
  const response = await bidResponseService.submit(body.bidRequestId, {
    submissionSource: body.submissionSource,
    totalAmount: body.totalAmount,
    notes: body.notes,
    lineItems: body.lineItems,
  });
  return created(res, response);
}

export async function addAttachment(req: Request, res: Response) {
  const body = addAttachmentBody.parse(req.body);
  const attachment = await bidResponseService.addAttachment(
    String(req.params.responseId),
    req.user!.organizationId,
    body,
  );
  return created(res, attachment);
}

// ─── Bid Documents ──────────────────────────────────────────────────────────

export async function listDocuments(req: Request, res: Response) {
  const docs = await bidResponseService.listDocuments(
    String(req.params.packageId),
    req.user!.organizationId,
  );
  return ok(res, docs);
}

export async function addDocument(req: Request, res: Response) {
  const body = addDocumentBody.parse(req.body);
  const doc = await bidResponseService.addDocument(
    String(req.params.packageId),
    req.user!.organizationId,
    req.user!.id,
    body,
  );
  return created(res, doc);
}

export async function removeDocument(req: Request, res: Response) {
  await bidResponseService.removeDocument(
    String(req.params.docId),
    req.user!.organizationId,
  );
  return res.status(204).end();
}

// ─── Public portal endpoints (no auth, token-based) ─────────────────────────

export async function portalSubmit(req: Request, res: Response) {
  const body = submitBody.parse(req.body);
  const token = String(req.params.token);
  const response = await bidResponseService.submitViaPortal(token, body);
  return created(res, response);
}

export async function portalGetRequest(req: Request, res: Response) {
  const { getRequestByToken, markViewed } = await import(
    '../services/bidPackageService.js'
  );
  const token = String(req.params.token);
  const request = await getRequestByToken(token);
  if (!request) throw new NotFoundError('Invalid or expired link');

  if (request.status === 'SENT' || request.status === 'PENDING') {
    await markViewed(token);
  }

  const existingResponse = await bidResponseService.getByBidRequest(request.id);

  return ok(res, {
    request: {
      id: request.id,
      vendorName: request.vendorName,
      vendorEmail: request.vendorEmail,
      status: request.status,
    },
    bidPackage: request.bidPackage,
    organization: request.organization,
    response: existingResponse,
  });
}
