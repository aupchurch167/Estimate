/**
 * Liveness + readiness endpoints.
 *
 * - GET /health  — pure liveness. 200 with a fresh timestamp. Cheap
 *   enough to ping every few seconds from a load balancer.
 * - GET /healthz — readiness. Pings the DB so the orchestrator can
 *   distinguish "process is up" from "process is up AND can serve
 *   requests". Returns 503 with `{ status: 'unhealthy', db: 'down' }`
 *   if the DB ping fails so a rolling deploy doesn't promote a broken
 *   instance.
 *
 * Skipped by the request logger.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

healthRouter.get('/healthz', async (_req, res) => {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'up', checkedAt });
  } catch (err) {
    logger.error({ err }, '[healthz] DB ping failed');
    res.status(503).json({ status: 'unhealthy', db: 'down', checkedAt });
  }
});
