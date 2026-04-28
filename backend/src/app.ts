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

export function createApp(): Express {
  const app = express();

  // CORS — the frontend is served from APP_URL on a different port. Cookies
  // are httpOnly + sameSite, so we need credentials:true here so the browser
  // is willing to attach them on cross-origin requests.
  app.use(
    cors({
      origin: env.APP_URL,
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

  app.get('/', (_req, res) => {
    res.json({ app: 'Quill', status: 'ok' });
  });

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
