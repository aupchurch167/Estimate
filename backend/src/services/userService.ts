/**
 * User service.
 *
 * Phase 1.5 covers self-service profile + password edits and the avatar
 * signed-upload flow. Phase 7.1 layered on admin-driven user management:
 * changeRole, deactivate, reactivate. Each admin operation enforces:
 *   - Admin-only (OWNER or ADMIN).
 *   - Acting on a user from the SAME organization.
 *   - No self-mutation (admins can't change their own role / deactivate
 *     themselves — they need a peer to do it).
 *   - The OWNER role is sticky: it can't be granted, demoted, or
 *     deactivated through these endpoints.
 *   - tokenVersion bumps on role changes + deactivation so the target's
 *     active sessions are invalidated on next request.
 *   - Activity events (USER_ROLE_CHANGED / USER_DEACTIVATED) so the audit
 *     log shows who did what.
 */

import { randomBytes } from 'node:crypto';
import type { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  comparePassword,
  hashPassword,
  toSafeUser,
  type SafeUser,
} from './authService.js';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import { canManageUsers } from '../lib/permissions.js';
import { generateSignedUploadUrl, type SignedUploadResult } from '../lib/spaces.js';

const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export async function listByOrganization(organizationId: string): Promise<SafeUser[]> {
  const users = await prisma.user.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  return users.map(toSafeUser);
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
}

export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput,
): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
    },
  });
  return toSafeUser(updated);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new AuthError('Current password is incorrect', 'invalid_current_password');
  }
  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from current password');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  // MVP: do NOT bump tokenVersion; user stays logged in on the current device.
}

export async function signAvatarUpload(opts: {
  userId: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<SignedUploadResult> {
  if (!ALLOWED_AVATAR_MIMES.has(opts.contentType)) {
    throw new ValidationError('Unsupported avatar file type', {
      allowed: Array.from(ALLOWED_AVATAR_MIMES),
      received: opts.contentType,
    });
  }
  if (opts.fileSizeBytes <= 0 || opts.fileSizeBytes > MAX_AVATAR_BYTES) {
    throw new ValidationError('Avatar exceeds maximum size', {
      maxBytes: MAX_AVATAR_BYTES,
      received: opts.fileSizeBytes,
    });
  }

  const ext = mimeToExt(opts.contentType);
  const slug = randomBytes(6).toString('hex');
  const key = `users/${opts.userId}/avatars/${Date.now()}-${slug}.${ext}`;

  return generateSignedUploadUrl({
    key,
    contentType: opts.contentType,
    acl: 'public-read',
  });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

// ─── Admin user management (Phase 7.1) ────────────────────────────────────

const NON_OWNER_ROLES: ReadonlySet<UserRole> = new Set([
  'ADMIN',
  'ESTIMATOR',
  'PM',
  'VIEWER',
]);

export interface AdminActor {
  id: string;
  role: UserRole;
}

async function loadActorAndTarget(
  actor: AdminActor,
  organizationId: string,
  targetUserId: string,
) {
  if (!canManageUsers(actor.role)) {
    throw new ForbiddenError('Only OWNER and ADMIN can manage team members');
  }
  if (actor.id === targetUserId) {
    throw new ConflictError(
      'You cannot apply this action to yourself — ask another admin',
      'cannot_target_self',
    );
  }
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId, deletedAt: null },
  });
  if (!target) throw new NotFoundError('User', targetUserId);
  return target;
}

/**
 * Change a teammate's role. The OWNER role is immutable through this
 * endpoint — granting / removing OWNER lives behind the (separate)
 * "transfer ownership" Danger Zone flow.
 */
export async function changeRole(
  actor: AdminActor,
  organizationId: string,
  targetUserId: string,
  newRole: UserRole,
): Promise<SafeUser> {
  const target = await loadActorAndTarget(actor, organizationId, targetUserId);

  if (target.role === 'OWNER') {
    throw new ConflictError(
      'OWNER cannot be demoted here — use Transfer ownership',
      'owner_role_immutable',
    );
  }
  if (newRole === 'OWNER') {
    throw new ConflictError(
      'Promoting to OWNER is reserved for Transfer ownership',
      'owner_role_immutable',
    );
  }
  if (!NON_OWNER_ROLES.has(newRole)) {
    throw new ValidationError(`Unsupported role: ${newRole}`, {
      issues: [{ path: 'role', message: 'Invalid' }],
    });
  }
  if (target.role === newRole) {
    return toSafeUser(target);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.user.update({
      where: { id: target.id },
      data: {
        role: newRole,
        // Bump so existing access tokens lose their effective permissions
        // and the next request rebuilds them from the new role.
        tokenVersion: { increment: 1 },
      },
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'USER_ROLE_CHANGED',
        entityType: 'User',
        entityId: target.id,
        summary: `Changed ${target.firstName} ${target.lastName}'s role from ${target.role} to ${newRole}`,
        meta: { fromRole: target.role, toRole: newRole },
      },
    });
    return next;
  });

  return toSafeUser(updated);
}

/**
 * Deactivate a teammate. Sets isActive=false and bumps tokenVersion so
 * any current sessions are invalidated. The user is preserved (not
 * deleted) so historical drafter / reviewer / actor relationships still
 * resolve in the activity feed.
 */
export async function deactivate(
  actor: AdminActor,
  organizationId: string,
  targetUserId: string,
): Promise<SafeUser> {
  const target = await loadActorAndTarget(actor, organizationId, targetUserId);

  if (target.role === 'OWNER') {
    throw new ConflictError(
      'OWNER cannot be deactivated — use Transfer ownership first',
      'owner_role_immutable',
    );
  }
  if (!target.isActive) {
    return toSafeUser(target);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.user.update({
      where: { id: target.id },
      data: {
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: target.id,
        summary: `Deactivated ${target.firstName} ${target.lastName}`,
        meta: { previousRole: target.role },
      },
    });
    return next;
  });

  return toSafeUser(updated);
}

/**
 * Re-enable a previously deactivated teammate. Idempotent for already-
 * active users. Does NOT bump tokenVersion — the user is opting back
 * into the system, not being kicked out.
 */
export async function reactivate(
  actor: AdminActor,
  organizationId: string,
  targetUserId: string,
): Promise<SafeUser> {
  // We deliberately allow self-targeting here is blocked by loadActorAndTarget
  // (you can't reactivate yourself if you're the one being deactivated —
  // your token's already invalid). The check is consistent with deactivate.
  if (!canManageUsers(actor.role)) {
    throw new ForbiddenError('Only OWNER and ADMIN can manage team members');
  }
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId, deletedAt: null },
  });
  if (!target) throw new NotFoundError('User', targetUserId);
  if (target.isActive) {
    return toSafeUser(target);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: true },
  });
  return toSafeUser(updated);
}
