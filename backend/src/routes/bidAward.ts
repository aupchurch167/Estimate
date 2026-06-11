import { Router } from 'express';
import * as controller from '../controllers/bidAwardController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const writes = requireRole('OWNER', 'ADMIN', 'ESTIMATOR', 'PM');

export const bidAwardRouter = Router();
bidAwardRouter.use(requireAuth);

bidAwardRouter.post('/award', writes, asyncHandler(controller.award));
bidAwardRouter.post('/reconcile', writes, asyncHandler(controller.reconcile));
