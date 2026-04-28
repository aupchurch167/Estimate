import { Router } from 'express';
import * as controller from '../controllers/estimateController.js';
import * as commentController from '../controllers/commentController.js';
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

// Snapshots (Phase 4.4)
estimatesRouter.get('/:id/snapshots', asyncHandler(controller.listSnapshots));
estimatesRouter.get(
  '/:id/snapshots/:snapshotId',
  asyncHandler(controller.getSnapshot),
);

// PDF / XLSX exports (Phase 4.5)
estimatesRouter.get('/:id/exports', asyncHandler(controller.listExports));
estimatesRouter.post('/:id/exports', asyncHandler(controller.createExport));

// Send (Phase 4.6)
estimatesRouter.post('/:id/send', asyncHandler(controller.sendEstimate));

// Comments + activity feed (Phase 4.2)
estimatesRouter.get('/:id/comments', asyncHandler(commentController.listForEstimate));
estimatesRouter.post('/:id/comments', asyncHandler(commentController.createForEstimate));
estimatesRouter.patch(
  '/:id/comments/:commentId',
  asyncHandler(commentController.patchComment),
);
estimatesRouter.delete(
  '/:id/comments/:commentId',
  asyncHandler(commentController.deleteComment),
);
estimatesRouter.get('/:id/activity', asyncHandler(commentController.listActivity));
