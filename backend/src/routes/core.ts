import { Router } from 'express';
import * as controller from '../controllers/coreController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const coreRouter = Router();

coreRouter.use(requireAuth);

// Accounts
coreRouter.get('/accounts', asyncHandler(controller.searchAccounts));
coreRouter.get('/accounts/:id', asyncHandler(controller.getAccount));
coreRouter.get('/accounts/:id/contacts', asyncHandler(controller.getAccountContacts));
coreRouter.get('/accounts/:id/deals', asyncHandler(controller.getAccountDeals));
coreRouter.get('/accounts/:id/properties', asyncHandler(controller.getAccountProperties));

// Deals
coreRouter.get('/deals', asyncHandler(controller.searchDeals));

// Vendors
coreRouter.get('/vendors', asyncHandler(controller.searchVendors));
coreRouter.get('/vendors/:id', asyncHandler(controller.getVendor));
coreRouter.post('/vendors/sync', asyncHandler(controller.syncVendors));

// Projects
coreRouter.get('/projects', asyncHandler(controller.searchProjects));
coreRouter.get('/projects/:id', asyncHandler(controller.getProject));
coreRouter.post('/projects/sync', asyncHandler(controller.syncProjects));
