import { Router } from 'express';
import * as controller from '../controllers/invitationController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const invitationsRouter = Router();

// Public (token-gated) endpoints — must be declared BEFORE the requireAuth
// guard or they would be inaccessible without an auth cookie.
invitationsRouter.get('/:token', asyncHandler(controller.getPublic));
invitationsRouter.post('/:token/accept', asyncHandler(controller.accept));

// Authenticated, admin-only management.
invitationsRouter.use(requireAuth);

invitationsRouter.post(
  '/',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.create),
);
invitationsRouter.get(
  '/',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.list),
);
invitationsRouter.delete(
  '/:id',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.revoke),
);
