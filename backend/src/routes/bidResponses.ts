import { Router } from 'express';
import * as controller from '../controllers/bidResponseController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const writes = requireRole('OWNER', 'ADMIN', 'ESTIMATOR', 'PM');

export const bidResponsesRouter = Router();
bidResponsesRouter.use(requireAuth);

bidResponsesRouter.get('/packages/:packageId/responses', asyncHandler(controller.listByPackage));
bidResponsesRouter.post('/responses', writes, asyncHandler(controller.manualSubmit));
bidResponsesRouter.post('/responses/:responseId/attachments', writes, asyncHandler(controller.addAttachment));

bidResponsesRouter.get('/packages/:packageId/documents', asyncHandler(controller.listDocuments));
bidResponsesRouter.post('/packages/:packageId/documents/sign', writes, asyncHandler(controller.signDocumentUpload));
bidResponsesRouter.post('/packages/:packageId/documents', writes, asyncHandler(controller.addDocument));
bidResponsesRouter.delete('/documents/:docId', writes, asyncHandler(controller.removeDocument));

// Public portal routes (no auth — token-based access)
export const bidPortalRouter = Router();
bidPortalRouter.get('/:token', asyncHandler(controller.portalGetRequest));
bidPortalRouter.post('/:token/respond', asyncHandler(controller.portalSubmit));
