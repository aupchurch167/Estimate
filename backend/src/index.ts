import { env } from './lib/env.js';
import express from 'express';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

const app = express();

// Global middleware
app.use(express.json());
app.use(requestLogger);

// Routes
app.use(healthRouter);

app.get('/', (_req, res) => {
  res.json({ app: 'Quill', status: 'ok' });
});

// Error handler — must be last
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, '[quill backend] listening');
});
