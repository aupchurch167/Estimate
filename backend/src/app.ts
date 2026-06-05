/**
 * Express app factory.
 *
 * Returns a configured app *without* binding to a port — index.ts handles
 * the listen call, tests mount the same factory via supertest.
 */

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './lib/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { organizationsRouter } from './routes/organizations.js';
import { invitationsRouter } from './routes/invitations.js';
import {
  categoriesRouter,
  entriesRouter,
  markupRulesRouter,
  priceBooksRouter,
} from './routes/pricing.js';
import { estimatesRouter } from './routes/estimates.js';
import {
  estimateScopeRouter,
  lineItemsRouter,
  scopeSectionsRouter,
} from './routes/scope.js';
import {
  estimateSourcesRouter,
  sourceInputsRouter,
} from './routes/sourceInputs.js';
import { aiRunsRouter, estimateAiRouter } from './routes/aiRuns.js';
import { notificationsRouter } from './routes/notifications.js';
import { dashboardRouter } from './routes/dashboard.js';
import { coreRouter } from './routes/core.js';
import { tradesRouter } from './routes/trades.js';
import { bidPackagesRouter } from './routes/bidPackages.js';
import { bidResponsesRouter, bidPortalRouter } from './routes/bidResponses.js';
import { bidRemindersRouter } from './routes/bidReminders.js';
import { bidAwardRouter } from './routes/bidAward.js';
import { bidInboundEmailRouter } from './routes/bidInboundEmail.js';

export function createApp(): Express {
  const app = express();

  // CORS — the frontend is served from APP_URL on a different port. Cookies
  // are httpOnly + sameSite, so we need credentials:true here so the browser
  // is willing to attach them on cross-origin requests.
  app.use(
    cors({
      origin: env.APP_URL.replace(/\/$/, ''),
      credentials: true,
    }),
  );

  // Global middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Routes
  app.use(healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/price-books', priceBooksRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/markup-rules', markupRulesRouter);
  app.use('/api/estimates', estimatesRouter);
  // Sub-paths under /api/estimates/:id for scope sections (mount AFTER the
  // estimatesRouter so the bare PATCH/GET/DELETE at /api/estimates/:id wins).
  app.use('/api/estimates', estimateScopeRouter);
  app.use('/api/scope-sections', scopeSectionsRouter);
  app.use('/api/line-items', lineItemsRouter);
  app.use('/api/estimates', estimateSourcesRouter);
  app.use('/api/source-inputs', sourceInputsRouter);
  app.use('/api/estimates', estimateAiRouter);
  app.use('/api/ai-runs', aiRunsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/core', coreRouter);
  app.use('/api/trades', tradesRouter);
  app.use('/api/bid-packages', bidPackagesRouter);
  app.use('/api/bids', bidResponsesRouter);
  app.use('/api/portal/bid', bidPortalRouter);
  app.use('/api/bid-reminders', bidRemindersRouter);
  app.use('/api/bids', bidAwardRouter);
  app.use('/api/webhooks/bid-email', bidInboundEmailRouter);

  app.get('/', (_req, res) => {
    res.json({ app: 'Quill', status: 'ok' });
  });

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
