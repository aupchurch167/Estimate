import { Router } from 'express';
import * as controller from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(controller.listNotifications));
notificationsRouter.get('/unread-count', asyncHandler(controller.getUnreadCount));
notificationsRouter.post('/read-all', asyncHandler(controller.markAllRead));
notificationsRouter.patch('/:id', asyncHandler(controller.markRead));
