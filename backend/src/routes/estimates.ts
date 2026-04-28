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
