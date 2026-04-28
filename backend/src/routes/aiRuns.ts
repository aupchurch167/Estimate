import { Router } from 'express';
import * as controller from '../controllers/aiRunsController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Mounted under /api/estimates so :id is the estimate id.
export const estimateAiRouter = Router();
estimateAiRouter.use(requireAuth);
estimateAiRouter.get('/:id/ai-runs', asyncHandler(controller.listForEstimate));
estimateAiRouter.post('/:id/ai-runs', asyncHandler(controller.createRun));
estimateAiRouter.get('/:id/conversation', asyncHandler(controller.getConversation));

// /api/ai-runs/:id — read-only access to a single run + messages.
export const aiRunsRouter = Router();
aiRunsRouter.use(requireAuth);
aiRunsRouter.get('/:id', asyncHandler(controller.getOne));
