/**
 * Auth cookie helpers.
 *
 * Both cookies are httpOnly + sameSite-restricted. `secure` is true in
 * production so cookies only travel over HTTPS; in dev (no TLS) we relax it
 * so the browser still stores them.
 */

import type { CookieOptions, Response } from 'express';
import { env } from './env.js';
import { durationToMs } from './duration.js';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';

const isProd = env.NODE_ENV === 'production';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
};

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: durationToMs(env.JWT_ACCESS_EXPIRES_IN),
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
}
