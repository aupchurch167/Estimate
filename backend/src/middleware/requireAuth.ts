/**
 * Authentication middleware.
 *
 * Reads the access cookie, verifies the JWT, loads the User (with
 * organization + settings) from the database, and attaches typed values
 * to `req` for downstream handlers. Throws AuthError on any failure —
 * the global error handler renders the 401.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { AuthError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/authService.js';
import { prisma } from '../lib/prisma.js';

async function attachAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token || typeof token !== 'string') {
    throw new AuthError('Not authenticated', 'not_authenticated');
  }
  const payload = verifyAccessToken(token);

  const userWithOrg = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { organization: { include: { settings: true } } },
  });
  if (!userWithOrg || !userWithOrg.isActive || userWithOrg.deletedAt) {
    throw new AuthError('Not authenticated', 'not_authenticated');
  }
  const { organization, ...user } = userWithOrg;
  const { settings, ...org } = organization;
  if (!settings) {
    throw new AuthError('Org settings missing', 'org_settings_missing');
  }
  req.user = user;
  req.organization = org;
  req.settings = settings;
  next();
}

export const requireAuth: RequestHandler = (req, res, next) => {
  attachAuth(req, res, next).catch(next);
};
