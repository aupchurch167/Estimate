/**
 * Request logger.
 *
 * Logs one structured line per finished request — method, path, status,
 * duration in ms. Skips /health so monitoring traffic doesn't drown the
 * log stream.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../lib/logger.js';

const SKIP_PATHS = new Set(['/health']);

export const requestLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      },
      'request',
    );
  });

  next();
};
