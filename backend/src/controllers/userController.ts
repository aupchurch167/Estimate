/**
 * User HTTP controllers.
 *
 * Phase 1.5: self-service profile, password, and avatar signed-upload.
 * Phase 7.1: admin tools — role changes, deactivate, reactivate. Admin
 * endpoints live on dedicated paths so the existing self-service PATCH
 * (`assertSelf`) keeps its tight scope.
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

export async function listUsers(req: Request, res: Response): Promise<void> {
  if (!req.organization) throw new ForbiddenError('Not authenticated');
  const users = await userService.listByOrganization(req.organization.id);
  ok(res, { users });
}

// ─── Admin endpoints (Phase 7.1) ─────────────────────────────────────────

const roleBody = z.object({
  role: z.enum(['ADMIN', 'ESTIMATOR', 'PM', 'VIEWER']),
});

function adminContext(req: Request): {
  actor: { id: string; role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER' };
  organizationId: string;
  targetUserId: string;
} {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  const targetUserId = String(req.params.id ?? '');
  if (!targetUserId) {
    throw new ValidationError('Missing user id', {
      issues: [{ path: 'id', message: 'Required' }],
    });
  }
  return {
    actor: { id: req.user.id, role: req.user.role },
    organizationId: req.organization.id,
    targetUserId,
  };
}

export async function adminChangeRole(req: Request, res: Response): Promise<void> {
  const { actor, organizationId, targetUserId } = adminContext(req);
  const input = parse(roleBody, req.body);
  const user = await userService.changeRole(actor, organizationId, targetUserId, input.role);
  ok(res, { user });
}

export async function adminDeactivate(req: Request, res: Response): Promise<void> {
  const { actor, organizationId, targetUserId } = adminContext(req);
  const user = await userService.deactivate(actor, organizationId, targetUserId);
  ok(res, { user });
}

export async function adminReactivate(req: Request, res: Response): Promise<void> {
  const { actor, organizationId, targetUserId } = adminContext(req);
  const user = await userService.reactivate(actor, organizationId, targetUserId);
  ok(res, { user });
}
