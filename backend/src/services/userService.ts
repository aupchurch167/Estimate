/**
 * User service.
 *
 * Phase 1.5 covers self-service profile + password edits and the avatar
 * signed-upload flow. Admin-driven user management (role changes,
 * deactivation, deletion) lives in services that arrive in Phase 7.1.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import {
  comparePassword,
  hashPassword,
  toSafeUser,
  type SafeUser,
} from './authService.js';
import { AuthError, NotFoundError, ValidationError } from '../lib/errors.js';
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
