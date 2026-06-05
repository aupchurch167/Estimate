import { Router } from 'express';
import * as controller from '../controllers/bidPackageController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const writes = requireRole('OWNER', 'ADMIN', 'ESTIMATOR', 'PM');

export const bidPackagesRouter = Router();
bidPackagesRouter.use(requireAuth);

bidPackagesRouter.get('/', asyncHandler(controller.listPackages));
bidPackagesRouter.post('/', writes, asyncHandler(controller.createPackage));
bidPackagesRouter.get('/:id', asyncHandler(controller.getPackage));
bidPackagesRouter.patch('/:id', writes, asyncHandler(controller.updatePackage));
bidPackagesRouter.delete('/:id', writes, asyncHandler(controller.deletePackage));

bidPackagesRouter.post('/:id/publish', writes, asyncHandler(controller.publishPackage));
bidPackagesRouter.post('/:id/close', writes, asyncHandler(controller.closePackage));
bidPackagesRouter.post('/:id/cancel', writes, asyncHandler(controller.cancelPackage));

bidPackagesRouter.get('/:id/requests', asyncHandler(controller.listRequests));
bidPackagesRouter.post('/:id/requests', writes, asyncHandler(controller.addRequest));
bidPackagesRouter.delete('/:id/requests/:requestId', writes, asyncHandler(controller.removeRequest));
