import { Router } from 'express';
import * as controller from '../controllers/organizationController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

// Read is open to any authenticated user in the org.
organizationsRouter.get('/current', asyncHandler(controller.getCurrent));

// Writes are OWNER/ADMIN only.
organizationsRouter.patch(
  '/current',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.patchOrganization),
);
organizationsRouter.patch(
  '/current/settings',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.patchSettings),
);
organizationsRouter.post(
  '/current/logo',
  requireRole('OWNER', 'ADMIN'),
  asyncHandler(controller.signLogoUpload),
);
