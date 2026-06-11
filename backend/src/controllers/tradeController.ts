import type { Request, Response } from 'express';
import { z } from 'zod';
import * as tradeService from '../services/tradeService.js';
import { NotFoundError } from '../lib/errors.js';
import { ok, created } from '../lib/response.js';

const tradeCategoryEnum = z.enum([
  'MECHANICAL',
  'ELECTRICAL',
  'PLUMBING',
  'FIRE_PROTECTION',
  'STRUCTURAL',
  'ARCHITECTURAL',
  'FINISHES',
  'SPECIALTIES',
  'EXTERIOR',
  'SITE',
  'EQUIPMENT',
  'GENERAL',
]);

const createMappingBody = z.object({
  rawTrade: z.string().min(1).max(200),
  tradeCanonicalId: z.string().min(1),
});

const updateMappingBody = z.object({
  tradeCanonicalId: z.string().min(1),
});

const unmappedBody = z.object({
  rawTrades: z.array(z.string().min(1)).min(1).max(500),
});

export async function listCanonical(req: Request, res: Response) {
  const category = req.query.category
    ? tradeCategoryEnum.parse(req.query.category)
    : undefined;
  const trades = await tradeService.listCanonical(category);
  return ok(res, trades);
}

export async function listMappings(req: Request, res: Response) {
  const mappings = await tradeService.listMappings(req.user!.organizationId);
  return ok(res, mappings);
}

export async function createMapping(req: Request, res: Response) {
  const body = createMappingBody.parse(req.body);
  const mapping = await tradeService.createMapping(
    req.user!.organizationId,
    body.rawTrade,
    body.tradeCanonicalId,
  );
  if (!mapping) throw new NotFoundError('Trade canonical not found');
  return created(res, mapping);
}

export async function updateMapping(req: Request, res: Response) {
  const body = updateMappingBody.parse(req.body);
  const mapping = await tradeService.updateMapping(
    String(req.params.id),
    req.user!.organizationId,
    body.tradeCanonicalId,
  );
  if (!mapping) throw new NotFoundError('Trade canonical not found');
  return ok(res, mapping);
}

export async function deleteMapping(req: Request, res: Response) {
  await tradeService.deleteMapping(String(req.params.id), req.user!.organizationId);
  return res.status(204).end();
}

export async function listUnmapped(req: Request, res: Response) {
  const body = unmappedBody.parse(req.body);
  const unmapped = await tradeService.listUnmapped(
    req.user!.organizationId,
    body.rawTrades,
  );
  return ok(res, unmapped);
}
