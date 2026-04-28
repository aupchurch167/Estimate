/**
 * Auth service.
 *
 * Owns password hashing, signup (creates Org + OrgSettings + first OWNER
 * User), login, refresh, logout, and token-version bumping. Uses the
 * stateless refresh-token strategy: the User row carries `tokenVersion`,
 * and refresh tokens encode it. Logout increments the field, invalidating
 * every outstanding refresh token at once.
 */

import bcrypt from 'bcrypt';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken as jwtVerifyAccess,
  verifyRefreshToken as jwtVerifyRefresh,
} from '../lib/jwt.js';
import { generateUniqueSlug, buildEstimateNumberPrefix } from '../lib/slug.js';
import { AuthError, ConflictError } from '../lib/errors.js';

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SafeUser = Omit<User, 'passwordHash' | 'tokenVersion' | 'deletedAt'>;

export function toSafeUser(user: User): SafeUser {
  // Strip sensitive + soft-delete bookkeeping fields before returning to a client.
  const {
    passwordHash: _passwordHash,
    tokenVersion: _tokenVersion,
    deletedAt: _deletedAt,
    ...safe
  } = user;
  return safe;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function tokensFor(user: User): AuthTokens {
  return {
    accessToken: signAccessToken({ sub: user.id, organizationId: user.organizationId }),
    refreshToken: signRefreshToken({ sub: user.id, tokenVersion: user.tokenVersion }),
  };
}

export async function signup(input: SignupInput) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw new ConflictError('A user with this email already exists', 'email_taken');
  }

  const slug = await generateUniqueSlug(input.companyName, async (candidate) => {
    return Boolean(await prisma.organization.findUnique({ where: { slug: candidate } }));
  });
  const estimateNumberPrefix = buildEstimateNumberPrefix(input.companyName);
  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const organization = await tx.organization.create({
      data: {
        name: input.companyName,
        slug,
        settings: {
          create: {
            estimateNumberPrefix,
            defaultMarkupPercent: '0.20',
            drafterCanSend: true,
            monthlyAiCostCapUsd: env.DEFAULT_MONTHLY_AI_CAP_USD,
          },
        },
      },
      include: { settings: true },
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'OWNER',
      },
    });

    return { organization, user };
  });

  return {
    user: toSafeUser(result.user),
    organization: result.organization,
    settings: result.organization.settings,
    tokens: tokensFor(result.user),
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.deletedAt) {
    throw new AuthError('Invalid email or password', 'invalid_credentials');
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid email or password', 'invalid_credentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: toSafeUser(user),
    tokens: tokensFor(user),
  };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = jwtVerifyRefresh(refreshToken);
  } catch {
    throw new AuthError('Invalid refresh token', 'invalid_refresh_token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.deletedAt) {
    throw new AuthError('Invalid refresh token', 'invalid_refresh_token');
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    throw new AuthError('Refresh token revoked', 'refresh_token_revoked');
  }

  return {
    user: toSafeUser(user),
    tokens: tokensFor(user),
  };
}

export async function logout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

export function verifyAccessToken(token: string) {
  try {
    return jwtVerifyAccess(token);
  } catch {
    throw new AuthError('Invalid access token', 'invalid_access_token');
  }
}
