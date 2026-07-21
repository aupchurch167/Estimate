import type { Request, Response } from 'express';
import { z } from 'zod';
import * as bidPackageService from '../services/bidPackageService.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { ok, created } from '../lib/response.js';

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

const bidPackageStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']);

const createBody = z.object({
  estimateId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  personalNote: z.string().max(5000).optional(),
  tradeCode: z.string().max(10).optional(),
  tradeCanonicalId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
});

const updateBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  personalNote: z.string().max(5000).nullable().optional(),
  tradeCode: z.string().max(10).nullable().optional(),
  tradeCanonicalId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

const addRequestBody = z.object({
  coreVendorId: z.string().optional(),
  proofVendorId: z.string().optional(),
  vendorName: z.string().min(1).max(200),
  vendorEmail: z.string().email(),
  vendorPhone: z.string().max(30).optional(),
});

export async function listPackages(req: Request, res: Response) {
  const estimateId = req.query.estimateId as string | undefined;
  const status = req.query.status
    ? parse(bidPackageStatusEnum, req.query.status)
    : undefined;
  const packages = await bidPackageService.list(
    req.user!.organizationId,
    estimateId,
    status,
  );
  return ok(res, packages);
}

export async function getPackage(req: Request, res: Response) {
  const pkg = await bidPackageService.get(
    String(req.params.id),
    req.user!.organizationId,
  );
  if (!pkg) throw new NotFoundError('Bid package not found');
  return ok(res, pkg);
}

export async function createPackage(req: Request, res: Response) {
  const body = parse(createBody, req.body);
  const pkg = await bidPackageService.create({
    organizationId: req.user!.organizationId,
    estimateId: body.estimateId,
    title: body.title,
    description: body.description,
    personalNote: body.personalNote,
    tradeCode: body.tradeCode,
    tradeCanonicalId: body.tradeCanonicalId,
    dueDate: body.dueDate,
    createdById: req.user!.id,
  });
  return created(res, pkg);
}

export async function updatePackage(req: Request, res: Response) {
  const body = parse(updateBody, req.body);
  const pkg = await bidPackageService.update(
    String(req.params.id),
    req.user!.organizationId,
    body,
  );
  return ok(res, pkg);
}

export async function publishPackage(req: Request, res: Response) {
  const pkg = await bidPackageService.publish(
    String(req.params.id),
    req.user!.organizationId,
  );
  return ok(res, pkg);
}

export async function closePackage(req: Request, res: Response) {
  const pkg = await bidPackageService.close(
    String(req.params.id),
    req.user!.organizationId,
  );
  return ok(res, pkg);
}

export async function cancelPackage(req: Request, res: Response) {
  const pkg = await bidPackageService.cancel(
    String(req.params.id),
    req.user!.organizationId,
  );
  return ok(res, pkg);
}

export async function deletePackage(req: Request, res: Response) {
  await bidPackageService.remove(
    String(req.params.id),
    req.user!.organizationId,
  );
  return res.status(204).end();
}

// ─── Bid Requests ───────────────────────────────────────────────────────────

export async function listRequests(req: Request, res: Response) {
  const requests = await bidPackageService.listRequests(
    String(req.params.id),
    req.user!.organizationId,
  );
  return ok(res, requests);
}

export async function addRequest(req: Request, res: Response) {
  const body = parse(addRequestBody, req.body);
  const request = await bidPackageService.addRequest(
    String(req.params.id),
    req.user!.organizationId,
    body,
  );
  return created(res, request);
}

export async function removeRequest(req: Request, res: Response) {
  await bidPackageService.removeRequest(
    String(req.params.requestId),
    req.user!.organizationId,
  );
  return res.status(204).end();
}
