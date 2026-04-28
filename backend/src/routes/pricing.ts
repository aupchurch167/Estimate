/**
 * Pricing routers.
 *
 * The brief mounts these at four different roots: /api/price-books,
 * /api/categories, /api/entries, /api/markup-rules. We export one router
 * per root from this file and let app.ts mount them.
 *
 * All write endpoints are gated by requireRole('OWNER', 'ADMIN'); reads
 * are open to any authenticated user in the org.
 */

import { Router } from 'express';
import * as controller from '../controllers/pricingController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const adminWrites = requireRole('OWNER', 'ADMIN');

// /api/price-books — books + their nested category & entry collections.
export const priceBooksRouter = Router();
priceBooksRouter.use(requireAuth);
priceBooksRouter.get('/', asyncHandler(controller.listPriceBooks));
priceBooksRouter.post('/', adminWrites, asyncHandler(controller.createPriceBook));
priceBooksRouter.patch('/:id', adminWrites, asyncHandler(controller.patchPriceBook));
priceBooksRouter.delete('/:id', adminWrites, asyncHandler(controller.deletePriceBook));
priceBooksRouter.get('/:id/categories', asyncHandler(controller.listCategories));
priceBooksRouter.post(
  '/:id/categories',
  adminWrites,
  asyncHandler(controller.createCategory),
);
priceBooksRouter.get('/:id/entries', asyncHandler(controller.listEntries));
priceBooksRouter.post('/:id/entries', adminWrites, asyncHandler(controller.createEntry));

// /api/categories — singular CRUD on existing categories.
export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);
categoriesRouter.patch('/:id', adminWrites, asyncHandler(controller.patchCategory));
categoriesRouter.delete('/:id', adminWrites, asyncHandler(controller.deleteCategory));

// /api/entries — singular CRUD on existing entries.
export const entriesRouter = Router();
entriesRouter.use(requireAuth);
entriesRouter.patch('/:id', adminWrites, asyncHandler(controller.patchEntry));
entriesRouter.delete('/:id', adminWrites, asyncHandler(controller.deleteEntry));

// /api/markup-rules — full CRUD; UI lands in P1.
export const markupRulesRouter = Router();
markupRulesRouter.use(requireAuth);
markupRulesRouter.get('/', asyncHandler(controller.listMarkupRules));
markupRulesRouter.post('/', adminWrites, asyncHandler(controller.createMarkupRule));
markupRulesRouter.patch('/:id', adminWrites, asyncHandler(controller.patchMarkupRule));
markupRulesRouter.delete('/:id', adminWrites, asyncHandler(controller.deleteMarkupRule));
