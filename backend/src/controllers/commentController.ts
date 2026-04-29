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
  parentCommentId: z.string().min(1).nullable().optional(),
  mentions: z.array(z.string().min(1)).max(50).optional(),
});

const patchBody = z.object({
  isResolved: z.boolean().optional(),
  body: z.string().min(1).max(4000).optional(),
  mentions: z.array(z.string().min(1)).max(50).optional(),
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
    {
      body: input.body,
      lineItemId: input.lineItemId ?? null,
      parentCommentId: input.parentCommentId ?? null,
      mentions: input.mentions,
    },
  );
  res.status(201).json({ comment });
}

export async function patchComment(req: Request, res: Response): Promise<void> {
  const { orgId, user } = actorFrom(req);
  const input = parse(patchBody, req.body ?? {});
  const commentId = String(req.params.commentId ?? '');

  // Body edits and resolve-toggle live on the same endpoint to keep the
  // surface small. Body wins over isResolved if both are provided so a
  // mistaken combo doesn't quietly drop the body.
  let comment;
  if (input.body !== undefined) {
    comment = await commentService.updateBody(
      orgId,
      { id: user.id, role: user.role },
      commentId,
      { body: input.body, mentions: input.mentions },
    );
  } else if (input.isResolved !== undefined) {
    comment = await commentService.setResolved(
      orgId,
      { id: user.id, role: user.role },
      commentId,
      input.isResolved,
    );
  } else {
    throw new ValidationError('Provide either body or isResolved', {
      issues: [{ path: '_root', message: 'Empty patch' }],
    });
  }
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

function readLimit(value: unknown): number | undefined {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined;
}

function readCursor(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function listActivity(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const result = await activityFeedService.listForEstimate(
    orgId,
    String(req.params.id ?? ''),
    {
      limit: readLimit(req.query.limit),
      cursor: readCursor(req.query.cursor),
    },
  );
  ok(res, result);
}

export async function listOrgActivity(req: Request, res: Response): Promise<void> {
  const { orgId } = actorFrom(req);
  const result = await activityFeedService.listForOrganization(orgId, {
    limit: readLimit(req.query.limit),
    cursor: readCursor(req.query.cursor),
  });
  ok(res, result);
}
