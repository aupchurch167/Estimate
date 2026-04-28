import type { Request, Response } from 'express';
import * as aiService from '../services/aiService.js';
import { ForbiddenError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

function actorFrom(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return { orgId: req.organization.id };
}

export async function listForEstimate(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const runs = await aiService.listRunsForEstimate(orgId, String(req.params.id ?? ''));
  ok(res, { runs });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const run = await aiService.getRun(orgId, String(req.params.id ?? ''));
  ok(res, { run });
}
