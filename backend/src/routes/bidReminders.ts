import { Router } from 'express';
import * as controller from '../controllers/bidReminderController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const writes = requireRole('OWNER', 'ADMIN', 'ESTIMATOR', 'PM');

export const bidRemindersRouter = Router();
bidRemindersRouter.use(requireAuth);

bidRemindersRouter.post('/', writes, asyncHandler(controller.schedule));
bidRemindersRouter.get('/packages/:packageId', asyncHandler(controller.listForPackage));
bidRemindersRouter.delete('/packages/:packageId', writes, asyncHandler(controller.cancelForPackage));

// Internal cron endpoint — call from Railway cron job or scheduler
bidRemindersRouter.post('/process', requireRole('OWNER', 'ADMIN'), asyncHandler(controller.processDue));
