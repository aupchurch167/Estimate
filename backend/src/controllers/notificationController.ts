import type { Request, Response } from 'express';
import { z } from 'zod';
import * as notifications from '../services/notificationService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

function actorFrom(req: Request) {
  if (!req.user) throw new ForbiddenError('Not authenticated');
  return req.user;
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

const listQuery = z.object({
  unread: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const user = actorFrom(req);
  const q = parse(listQuery, req.query);
  const items = await notifications.listForUser(user.id, {
    unreadOnly: q.unread,
    limit: q.limit,
  });
  ok(res, { notifications: items });
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const user = actorFrom(req);
  const count = await notifications.unreadCount(user.id);
  ok(res, { unreadCount: count });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const user = actorFrom(req);
  const notification = await notifications.markRead(
    user.id,
    String(req.params.id ?? ''),
  );
  ok(res, { notification });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const user = actorFrom(req);
  const count = await notifications.markAllRead(user.id);
  ok(res, { count });
}
