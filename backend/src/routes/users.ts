import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', asyncHandler(controller.listUsers));
usersRouter.patch('/:id', asyncHandler(controller.updateUser));
usersRouter.patch('/:id/password', asyncHandler(controller.changePassword));
usersRouter.post('/:id/avatar', asyncHandler(controller.signAvatarUpload));

// Admin user management (Phase 7.1).
usersRouter.patch(
  '/:id/role',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.adminChangeRole),
);
usersRouter.post(
  '/:id/deactivate',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.adminDeactivate),
);
usersRouter.post(
  '/:id/reactivate',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.adminReactivate),
);
