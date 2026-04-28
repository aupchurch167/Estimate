import { Router } from 'express';
import * as controller from '../controllers/estimateController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const estimatesRouter = Router();

estimatesRouter.use(requireAuth);

estimatesRouter.get('/', asyncHandler(controller.listEstimates));
estimatesRouter.post('/', asyncHandler(controller.createEstimate));
estimatesRouter.get('/:id', asyncHandler(controller.getEstimate));
estimatesRouter.patch('/:id', asyncHandler(controller.patchEstimate));
estimatesRouter.delete('/:id', asyncHandler(controller.deleteEstimate));

// Review workflow (Phase 4.1)
estimatesRouter.get('/:id/review-actions', asyncHandler(controller.listReviewActions));
estimatesRouter.post('/:id/submit', asyncHandler(controller.submitForReview));
estimatesRouter.post('/:id/approve', asyncHandler(controller.approveEstimate));
estimatesRouter.post('/:id/request-changes', asyncHandler(controller.requestChanges));
estimatesRouter.post('/:id/unlock', asyncHandler(controller.unlockEstimate));
