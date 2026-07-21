import { Router } from 'express';
import * as controller from '../controllers/proofController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const proofRouter = Router();

proofRouter.use(requireAuth);

// Vendor directory + COI
proofRouter.get('/vendors', asyncHandler(controller.searchVendors));
proofRouter.get('/vendors/:id', asyncHandler(controller.getVendor));
proofRouter.post('/vendors/:id/coi-request', asyncHandler(controller.requestCoi));
proofRouter.get('/vendors/:id/coi-requests', asyncHandler(controller.listCoiRequests));
