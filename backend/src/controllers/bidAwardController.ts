import type { Request, Response } from 'express';
import { z } from 'zod';
import * as awardService from '../services/bidAwardService.js';
import { ok } from '../lib/response.js';

const awardBody = z.object({
  bidRequestId: z.string().min(1),
});

const reconcileBody = z.object({
  bidResponseId: z.string().min(1),
  estimateId: z.string().min(1),
  scopeSectionId: z.string().min(1),
});

export async function award(req: Request, res: Response) {
  const body = awardBody.parse(req.body);
  const result = await awardService.awardBid(
    body.bidRequestId,
    req.user!.organizationId,
  );
  return ok(res, result);
}

export async function reconcile(req: Request, res: Response) {
  const body = reconcileBody.parse(req.body);
  const result = await awardService.reconcileToEstimate(
    body.bidResponseId,
    req.user!.organizationId,
    body.estimateId,
    body.scopeSectionId,
  );
  return ok(res, result);
}
