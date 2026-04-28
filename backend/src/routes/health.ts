/**
 * Liveness endpoint. Returns 200 with a fresh timestamp. Used by uptime
 * monitors and load balancers. Skipped by the request logger.
 */

import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
