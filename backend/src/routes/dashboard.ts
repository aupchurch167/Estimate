import { Router } from 'express';
import * as controller from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get('/', asyncHandler(controller.getDashboard));
