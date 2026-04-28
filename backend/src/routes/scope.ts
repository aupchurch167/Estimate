/**
 * Scope section + line item routers.
 *
 * Mount points (per brief Section 6):
 *   /api/estimates/:id/scope-sections      → POST + PATCH-reorder via PATCH /reorder
 *   /api/scope-sections/:id                → PATCH + DELETE
 *   /api/scope-sections/:id/line-items     → POST
 *   /api/line-items/:id                    → PATCH + DELETE
 *   /api/line-items/bulk                   → POST
 */

import { Router } from 'express';
import * as controller from '../controllers/scopeController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// Sub-router under the existing /api/estimates/:id router (cannot reuse the
// estimatesRouter because :id is the estimate id; we mount a new router at
// the same prefix).
export const estimateScopeRouter = Router();
estimateScopeRouter.use(requireAuth);
estimateScopeRouter.post(
  '/:id/scope-sections',
  asyncHandler(controller.createSection),
);
estimateScopeRouter.patch(
  '/:id/scope-sections/reorder',
  asyncHandler(controller.reorderSections),
);

export const scopeSectionsRouter = Router();
scopeSectionsRouter.use(requireAuth);
scopeSectionsRouter.patch('/:id', asyncHandler(controller.patchSection));
scopeSectionsRouter.delete('/:id', asyncHandler(controller.deleteSection));
scopeSectionsRouter.post('/:id/line-items', asyncHandler(controller.createLineItem));

export const lineItemsRouter = Router();
lineItemsRouter.use(requireAuth);
// /bulk must be declared before /:id so it isn't captured as id="bulk".
lineItemsRouter.post('/bulk', asyncHandler(controller.bulkLineItems));
lineItemsRouter.patch('/:id', asyncHandler(controller.patchLineItem));
lineItemsRouter.delete('/:id', asyncHandler(controller.deleteLineItem));
