import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', asyncHandler(controller.listUsers));
usersRouter.patch('/:id', asyncHandler(controller.updateUser));
usersRouter.patch('/:id/password', asyncHandler(controller.changePassword));
usersRouter.post('/:id/avatar', asyncHandler(controller.signAvatarUpload));
