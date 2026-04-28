/**
 * JWT helpers for access + refresh tokens.
 *
 * Refresh tokens encode the user's `tokenVersion`. Logout / password rotation
 * bumps that field; any refresh token signed against the previous version is
 * rejected — no server-side token store needed.
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env.js';

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
}

const ACCESS_OPTS: SignOptions = {
  expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
};
const REFRESH_OPTS: SignOptions = {
  expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, ACCESS_OPTS);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, REFRESH_OPTS);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid access token payload');
  }
  return decoded as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid refresh token payload');
  }
  return decoded as RefreshTokenPayload;
}
