/**
 * Express app factory.
 *
 * Returns a configured app *without* binding to a port — index.ts handles
 * the listen call, tests mount the same factory via supertest.
 */

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  // Global middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Routes
  app.use(healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  app.get('/', (_req, res) => {
    res.json({ app: 'Quill', status: 'ok' });
  });

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
