import { Router } from 'express';
import * as controller from '../controllers/aiRunsController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { aiLimiter } from '../middleware/rateLimit.js';

// Mounted under /api/estimates so :id is the estimate id.
export const estimateAiRouter = Router();
estimateAiRouter.use(requireAuth);
estimateAiRouter.get('/:id/ai-runs', asyncHandler(controller.listForEstimate));
estimateAiRouter.post(
  '/:id/ai-runs',
  aiLimiter,
  asyncHandler(controller.createRun),
);
estimateAiRouter.get('/:id/conversation', asyncHandler(controller.getConversation));
estimateAiRouter.post(
  '/:id/ai-runs/:runId/apply',
  asyncHandler(controller.applyRunActions),
);

// /api/ai-runs/...
export const aiRunsRouter = Router();
aiRunsRouter.use(requireAuth);
// Admin-only org usage rollup. Mounted before /:id so the literal
// "usage" path wins over the dynamic param.
aiRunsRouter.get('/usage', asyncHandler(controller.getUsage));
aiRunsRouter.get('/:id', asyncHandler(controller.getOne));
