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
import { OAuth2Client } from 'google-auth-library';
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

// Reused across requests — the client just holds the audience and fetches +
// caches Google's public signing keys internally.
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AuthError('Google sign-in is not configured', 'google_not_configured');
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

/**
 * Sign in with a Google ID token (the `credential` from Google Identity
 * Services). We verify the token against Google's keys, then log in the
 * existing Quill user whose email matches. This is login-only: a Google
 * account with no matching Quill user is rejected — accounts are created via
 * signup or invitation, not by signing in with Google.
 */
export async function loginWithGoogle(idToken: string) {
  const client = getGoogleClient();

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AuthError('Invalid Google credential', 'invalid_google_token');
  }

  if (!payload?.email) {
    throw new AuthError('Invalid Google credential', 'invalid_google_token');
  }
  if (!payload.email_verified) {
    throw new AuthError('Google email not verified', 'google_email_unverified');
  }

  const user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user || !user.isActive || user.deletedAt) {
    // Don't reveal whether the email exists but is disabled — a single code
    // the UI turns into "ask an admin for an invite".
    throw new AuthError('No Quill account for this Google email', 'no_account');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      // Google has verified this email; record it if we hadn't already.
      ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      // Backfill an avatar from the Google profile if the user has none.
      ...(!user.avatarUrl && payload.picture ? { avatarUrl: payload.picture } : {}),
    },
  });

  return {
    user: toSafeUser(updated),
    tokens: tokensFor(updated),
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
