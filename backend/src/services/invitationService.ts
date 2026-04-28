/**
 * Invitation service.
 *
 * Owns the create / revoke / read-by-token / accept lifecycle. The accept
 * path is multi-step: validate → create User in a transaction → mark the
 * invitation accepted → fire side effects (notification + activity event).
 * Returns AuthTokens so the controller can drop them into cookies.
 */

import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { generateToken } from '../lib/ids.js';
import { addDays } from '../lib/dates.js';
import { sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { hashPassword, toSafeUser, type AuthTokens, type SafeUser } from './authService.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { InvitationEmail } from '../emails/InvitationEmail.js';

export const INVITATION_TTL_DAYS = 7;

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface InvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedById: string;
  acceptedUserId: string | null;
  createdAt: Date;
}

export function invitationStatus(inv: InvitationRow, now: Date = new Date()): InvitationStatus {
  if (inv.acceptedAt) return 'ACCEPTED';
  if (inv.revokedAt) return 'REVOKED';
  if (inv.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'PENDING';
}

export function shapeInvitation(inv: InvitationRow) {
  return {
    id: inv.id,
    organizationId: inv.organizationId,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt.toISOString(),
    acceptedAt: inv.acceptedAt?.toISOString() ?? null,
    revokedAt: inv.revokedAt?.toISOString() ?? null,
    invitedById: inv.invitedById,
    acceptedUserId: inv.acceptedUserId,
    createdAt: inv.createdAt.toISOString(),
    status: invitationStatus(inv),
  };
}

// ─── Create ────────────────────────────────────────────────────────────────

export interface CreateInvitationInput {
  organizationId: string;
  inviterId: string;
  email: string;
  role: UserRole;
}

export interface CreateInvitationResult {
  invitation: ReturnType<typeof shapeInvitation>;
  acceptUrl: string;
  emailDispatched: boolean;
}

export async function create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  if (input.role === 'OWNER') {
    throw new ValidationError('Cannot invite users with OWNER role', { field: 'role' });
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  // No existing User anywhere with this email (one-org-per-user MVP rule).
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new ConflictError(
      'A user with this email already exists',
      'user_already_exists',
    );
  }

  // No existing pending invitation for (orgId, email).
  const existingPending = await prisma.invitation.findFirst({
    where: {
      organizationId: input.organizationId,
      email: normalizedEmail,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    throw new ConflictError(
      'A pending invitation already exists for this email',
      'invitation_pending',
    );
  }

  const inviter = await prisma.user.findUnique({ where: { id: input.inviterId } });
  if (!inviter) throw new NotFoundError('User', input.inviterId);

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
  });
  if (!organization) throw new NotFoundError('Organization', input.organizationId);

  const token = generateToken(32);
  const expiresAt = addDays(new Date(), INVITATION_TTL_DAYS);

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: input.organizationId,
      email: normalizedEmail,
      role: input.role,
      token,
      expiresAt,
      invitedById: input.inviterId,
    },
  });

  const acceptUrl = `${env.APP_URL.replace(/\/$/, '')}/invite/${token}`;

  // Email dispatch is fire-and-warn — the invitation is the source of truth
  // and the admin can resend if delivery failed.
  let dispatched = false;
  try {
    const result = await sendEmail({
      to: normalizedEmail,
      subject: `You're invited to join ${organization.name} on Quill`,
      react: InvitationEmail({
        orgName: organization.name,
        inviterName: `${inviter.firstName} ${inviter.lastName}`,
        role: input.role,
        acceptUrl,
        expiresAt: expiresAt.toISOString(),
      }),
    });
    dispatched = result.dispatched;
  } catch (err) {
    logger.warn({ err, invitationId: invitation.id }, 'invitation email dispatch threw');
  }

  return {
    invitation: shapeInvitation(invitation),
    acceptUrl,
    emailDispatched: dispatched,
  };
}

// ─── List + revoke ─────────────────────────────────────────────────────────

export type StatusFilter = 'pending' | 'accepted' | 'revoked' | 'expired';

export async function list(
  organizationId: string,
  status?: StatusFilter,
): Promise<ReturnType<typeof shapeInvitation>[]> {
  const where: Prisma.InvitationWhereInput = { organizationId };
  const now = new Date();
  if (status === 'pending') {
    where.acceptedAt = null;
    where.revokedAt = null;
    where.expiresAt = { gt: now };
  } else if (status === 'accepted') {
    where.acceptedAt = { not: null };
  } else if (status === 'revoked') {
    where.revokedAt = { not: null };
  } else if (status === 'expired') {
    where.acceptedAt = null;
    where.revokedAt = null;
    where.expiresAt = { lte: now };
  }
  const rows = await prisma.invitation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(shapeInvitation);
}

export async function revoke(organizationId: string, invitationId: string): Promise<void> {
  const inv = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.organizationId !== organizationId) {
    throw new NotFoundError('Invitation', invitationId);
  }
  if (inv.revokedAt) return; // idempotent
  if (inv.acceptedAt) {
    throw new ConflictError('Cannot revoke an already-accepted invitation', 'already_accepted');
  }
  await prisma.invitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });
}

// ─── Public read by token ──────────────────────────────────────────────────

export interface PublicInvitationView {
  email: string;
  role: UserRole;
  organizationName: string;
  inviterName: string;
  expiresAt: string;
}

export async function getPublicByToken(token: string): Promise<PublicInvitationView> {
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: true,
      invitedBy: true,
    },
  });
  if (!inv) {
    throw new NotFoundError('Invitation', token);
  }
  const status = invitationStatus(inv);
  if (status !== 'PENDING') {
    throw new ConflictError(
      `Invitation is ${status.toLowerCase()}`,
      `invitation_${status.toLowerCase()}`,
      { status },
    );
  }
  return {
    email: inv.email,
    role: inv.role,
    organizationName: inv.organization.name,
    inviterName: `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`,
    expiresAt: inv.expiresAt.toISOString(),
  };
}

// ─── Accept ────────────────────────────────────────────────────────────────

export interface AcceptInvitationInput {
  token: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AcceptInvitationResult {
  user: SafeUser;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  tokens: AuthTokens;
}

export async function accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  const inv = await prisma.invitation.findUnique({
    where: { token: input.token },
    include: { organization: true },
  });
  if (!inv) {
    throw new NotFoundError('Invitation', input.token);
  }

  const status = invitationStatus(inv);
  if (status !== 'PENDING') {
    throw new ConflictError(
      `Invitation is ${status.toLowerCase()}`,
      `invitation_${status.toLowerCase()}`,
      { status },
    );
  }

  const submittedEmail = input.email.trim().toLowerCase();
  if (submittedEmail !== inv.email) {
    throw new ValidationError('Email does not match the invitation', { field: 'email' });
  }

  const existing = await prisma.user.findUnique({ where: { email: submittedEmail } });
  if (existing) {
    throw new ConflictError(
      'A user with this email already exists',
      'user_already_exists',
    );
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: inv.organizationId,
        email: submittedEmail,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: inv.role,
      },
    });

    await tx.invitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date(), acceptedUserId: user.id },
    });

    // Side effects: notify the inviter; record the activity.
    await tx.notification.create({
      data: {
        organizationId: inv.organizationId,
        recipientId: inv.invitedById,
        type: 'INVITATION_ACCEPTED',
        title: `${user.firstName} ${user.lastName} joined ${inv.organization.name}`,
        body: `${user.email} accepted your invitation.`,
        entityType: 'User',
        entityId: user.id,
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: inv.organizationId,
        actorId: user.id,
        eventType: 'USER_JOINED',
        entityType: 'User',
        entityId: user.id,
        summary: `${user.firstName} ${user.lastName} joined`,
        meta: { invitationId: inv.id, invitedById: inv.invitedById },
      },
    });

    return user;
  });

  const tokens: AuthTokens = {
    accessToken: signAccessToken({ sub: result.id, organizationId: result.organizationId }),
    refreshToken: signRefreshToken({ sub: result.id, tokenVersion: result.tokenVersion }),
  };

  return {
    user: toSafeUser(result),
    organization: {
      id: inv.organization.id,
      name: inv.organization.name,
      slug: inv.organization.slug,
    },
    tokens,
  };
}
