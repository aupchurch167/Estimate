/**
 * Proof vendor + COI controllers.
 *
 * Proxy the Proof vendor directory and COI compliance to the frontend. Like the
 * Core controllers, every handler returns `{ enabled: false, ... }` when Proof
 * is off so the UI degrades gracefully without special-casing.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { proof, ProofApiError } from '../lib/proof.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import * as vendorService from '../services/proofVendorService.js';

function assertAuth(req: Request): void {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
}

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

const searchQuery = z.object({
  search: z.string().max(200).optional(),
  trade: z.string().max(120).optional(),
  coiStatus: z.enum(['compliant', 'expiring_soon', 'expired', 'pending', 'none']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const coiRequestBody = z.object({
  coverageTypes: z.array(z.string().max(60)).max(20).optional(),
  note: z.string().max(2000).optional(),
});

export async function searchVendors(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  const result = await vendorService.searchVendors(req.user!.organizationId, {
    search: q.search,
    trade: q.trade,
    coiStatus: q.coiStatus,
    limit: q.limit,
  });
  res.json({ enabled: proof.enabled(), ...result });
}

export async function getVendor(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const vendor = await vendorService.getVendor(req.user!.organizationId, String(req.params.id));
  if (!vendor) {
    res.status(404).json({ error: { code: 'not_found', message: 'Vendor not found' } });
    return;
  }
  res.json({ enabled: proof.enabled(), data: vendor });
}

export async function requestCoi(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  if (!proof.enabled()) {
    res.status(409).json({ error: { code: 'proof_disabled', message: 'Proof integration is off' } });
    return;
  }
  const body = parse(coiRequestBody, req.body ?? {});
  try {
    const request = await vendorService.requestCoi(req.user!.organizationId, String(req.params.id), {
      ...body,
      requestedByEmail: req.user!.email,
    });
    res.status(201).json({ enabled: true, data: request });
  } catch (err) {
    if (err instanceof ProofApiError) {
      if (err.isConflict) {
        // A COI request is already open — surface Proof's existing request.
        res.status(409).json({
          error: { code: err.code ?? 'coi_request_conflict', message: err.message, details: err.details },
        });
        return;
      }
      if (err.isNotFound) {
        res.status(404).json({ error: { code: 'not_found', message: 'Vendor not found' } });
        return;
      }
      logger.error({ status: err.status, code: err.code }, 'Proof COI request failed');
      res.status(502).json({ error: { code: 'upstream_error', message: 'Proof service error' } });
      return;
    }
    throw err;
  }
}

export async function listCoiRequests(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  if (!proof.enabled()) {
    res.json({ enabled: false, data: [] });
    return;
  }
  const limitQuery = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }), req.query);
  try {
    const result = await vendorService.listCoiRequests(String(req.params.id), { limit: limitQuery.limit });
    res.json({ enabled: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Proof COI request history failed');
    res.json({ enabled: true, data: [] });
  }
}
