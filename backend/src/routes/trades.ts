import { Router } from 'express';
import * as controller from '../controllers/tradeController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const adminWrites = requireRole('OWNER', 'ADMIN');

export const tradesRouter = Router();
tradesRouter.use(requireAuth);

tradesRouter.get('/canonical', asyncHandler(controller.listCanonical));

tradesRouter.get('/mappings', asyncHandler(controller.listMappings));
tradesRouter.post('/mappings', adminWrites, asyncHandler(controller.createMapping));
tradesRouter.patch('/mappings/:id', adminWrites, asyncHandler(controller.updateMapping));
tradesRouter.delete('/mappings/:id', adminWrites, asyncHandler(controller.deleteMapping));

tradesRouter.post('/unmapped', asyncHandler(controller.listUnmapped));
