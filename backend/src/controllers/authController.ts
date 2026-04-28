/**
 * Auth HTTP controllers — thin shells around authService that handle
 * request parsing, response shaping, and cookie setting.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import { AuthError, ValidationError } from '../lib/errors.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../lib/cookies.js';
import { ok } from '../lib/response.js';

const signupBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  companyName: z.string().min(1).max(120),
});

const loginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
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

export async function signup(req: Request, res: Response): Promise<void> {
  const input = parseBody(signupBody, req.body);
  const { user, organization, settings, tokens } = await authService.signup(input);
  setAuthCookies(res, tokens);
  res.status(201).json({ user, organization, settings });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = parseBody(loginBody, req.body);
  const { user, tokens } = await authService.login(input.email, input.password);
  setAuthCookies(res, tokens);
  ok(res, { user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new AuthError('Missing refresh token', 'missing_refresh_token');
  }
  const { user, tokens } = await authService.refresh(refreshToken);
  setAuthCookies(res, tokens);
  ok(res, { user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const accessToken = req.cookies?.[ACCESS_COOKIE];
  if (accessToken && typeof accessToken === 'string') {
    try {
      const payload = authService.verifyAccessToken(accessToken);
      await authService.logout(payload.sub);
    } catch {
      // Token already invalid — clearing cookies is still the right move.
    }
  }
  clearAuthCookies(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  // requireAuth middleware has populated these.
  if (!req.user || !req.organization || !req.settings) {
    throw new AuthError('Not authenticated', 'not_authenticated');
  }
  ok(res, {
    user: authService.toSafeUser(req.user),
    organization: req.organization,
    settings: req.settings,
  });
}
