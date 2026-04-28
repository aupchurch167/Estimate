import type { Request, Response } from 'express';
import { z } from 'zod';
import * as aiService from '../services/aiService.js';
import * as lineGenerationService from '../services/lineGenerationService.js';
import * as askFollowupService from '../services/askFollowupService.js';
import { ConflictError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { canCreateEstimate } from '../lib/permissions.js';

function actorFrom(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return { orgId: req.organization.id, user: req.user };
}

const createRunBody = z.discriminatedUnion('runType', [
  z.object({ runType: z.literal('GENERATE_LINE_ITEMS') }),
  z.object({
    runType: z.literal('ASK_FOLLOWUP'),
    userText: z.string().min(1, 'Required').max(2000, 'Too long'),
  }),
]);

export async function listForEstimate(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const runs = await aiService.listRunsForEstimate(orgId, String(req.params.id ?? ''));
  ok(res, { runs });
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const data = await aiService.getConversationForEstimate(
    orgId,
    String(req.params.id ?? ''),
  );
  ok(res, data);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const run = await aiService.getRun(orgId, String(req.params.id ?? ''));
  ok(res, { run });
}

export async function createRun(req: Request, res: Response): Promise<void> {
  const { orgId, user } = actorFrom(req);
  if (!canCreateEstimate(user.role)) {
    throw new ForbiddenError('Your role cannot trigger AI runs');
  }
  const parsed = createRunBody.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid body', {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  try {
    const estimateId = String(req.params.id ?? '');
    let result: unknown;
    if (parsed.data.runType === 'GENERATE_LINE_ITEMS') {
      result = await lineGenerationService.generate(orgId, user.id, estimateId);
    } else {
      result = await askFollowupService.ask(
        orgId,
        user.id,
        estimateId,
        parsed.data.userText,
      );
    }
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof aiService.MonthlyAiLimitError) {
      res.status(402).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    throw err;
  }
}
