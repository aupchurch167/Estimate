import type { Request, Response } from 'express';
import { z } from 'zod';
import * as commentService from '../services/commentService.js';
import * as activityFeedService from '../services/activityFeedService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

function actorFrom(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return { orgId: req.organization.id, user: req.user };
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

const createBody = z.object({
  body: z.string().min(1).max(4000),
  lineItemId: z.string().min(1).nullable().optional(),
});

const patchBody = z.object({
  isResolved: z.boolean(),
});

export async function listForEstimate(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const comments = await commentService.listForEstimate(
    orgId,
    String(req.params.id ?? ''),
  );
  ok(res, { comments });
}

export async function createForEstimate(req: Request, res: Response): Promise<void> {
  const { orgId, user } = actorFrom(req);
  const input = parse(createBody, req.body ?? {});
  const comment = await commentService.create(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.id ?? ''),
    { body: input.body, lineItemId: input.lineItemId ?? null },
  );
  res.status(201).json({ comment });
}

export async function patchComment(req: Request, res: Response): Promise<void> {
  const { orgId, user } = actorFrom(req);
  const input = parse(patchBody, req.body ?? {});
  const comment = await commentService.setResolved(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.commentId ?? ''),
    input.isResolved,
  );
  ok(res, { comment });
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const { orgId, user } = actorFrom(req);
  await commentService.softDelete(
    orgId,
    { id: user.id, role: user.role },
    String(req.params.commentId ?? ''),
  );
  res.status(204).end();
}

export async function listActivity(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const limitRaw = req.query.limit;
  const limit =
    typeof limitRaw === 'string' && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
  const events = await activityFeedService.listForEstimate(
    orgId,
    String(req.params.id ?? ''),
    limit,
  );
  ok(res, { events });
}
