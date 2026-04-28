/**
 * Role gate.
 *
 * `requireRole(...roles)` is a middleware factory. Mount it after
 * `requireAuth` so `req.user` is populated; it then returns 403 if the
 * authenticated user's role isn't in the allowlist.
 */

import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import { AuthError, ForbiddenError } from '../lib/errors.js';

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error('requireRole called with no roles — at least one is required');
  }
  return (req, _res, next) => {
    if (!req.user) {
      next(new AuthError('Not authenticated', 'not_authenticated'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(
        new ForbiddenError('Insufficient role for this action', {
          requiredRoles: allowedRoles,
          actualRole: req.user.role,
        }),
      );
      return;
    }
    next();
  };
}
