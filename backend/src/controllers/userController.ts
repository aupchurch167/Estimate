/**
 * User HTTP controllers.
 *
 * For Phase 1.5: self-service profile, password, and avatar-signed-upload.
 * Admin tools (role changes, deactivate, delete) arrive in Phase 7.1.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as userService from '../services/userService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

const profilePatchBody = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const avatarBody = z.object({
  contentType: z.string().min(1).max(80),
  fileSizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function assertSelf(req: Request): string {
  if (!req.user) throw new ForbiddenError('Not authenticated');
  const targetId = req.params.id;
  if (req.user.id !== targetId) {
    throw new ForbiddenError('You can only modify your own profile');
  }
  return targetId;
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const userId = assertSelf(req);
  const patch = parse(profilePatchBody, req.body);
  const user = await userService.updateProfile(userId, patch);
  ok(res, { user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const userId = assertSelf(req);
  const input = parse(passwordBody, req.body);
  await userService.changePassword(userId, input.currentPassword, input.newPassword);
  res.status(204).end();
}

export async function signAvatarUpload(req: Request, res: Response): Promise<void> {
  const userId = assertSelf(req);
  const input = parse(avatarBody, req.body);
  const signed = await userService.signAvatarUpload({
    userId,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
  });
  ok(res, signed);
}
