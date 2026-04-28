import { Router } from 'express';
import * as controller from '../controllers/sourceInputController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Sub-router under /api/estimates for the create-by-estimate endpoint.
export const estimateSourcesRouter = Router();
estimateSourcesRouter.use(requireAuth);
estimateSourcesRouter.post('/:id/source-inputs', asyncHandler(controller.createSource));

// /api/source-inputs — singular delete + signed-upload.
export const sourceInputsRouter = Router();
sourceInputsRouter.use(requireAuth);
sourceInputsRouter.post(
  '/signed-upload',
  asyncHandler(controller.signSourceUpload),
);
sourceInputsRouter.delete('/:id', asyncHandler(controller.deleteSource));
