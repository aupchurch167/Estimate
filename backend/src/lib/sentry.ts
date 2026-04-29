/**
 * Backend Sentry integration (Phase 10.4).
 *
 * Initialized once at process start, before the Express app boots, so
 * Sentry can intercept unhandled rejections + uncaught exceptions from
 * any module that loads after this. No-ops cleanly when SENTRY_DSN is
 * empty (dev / test) so unit tests don't open network connections.
 *
 * `captureExceptionIfNotAppError` wraps the global error handler so we
 * only report 5xx-level surprises — expected 4xx app errors stay out of
 * the issue queue.
 */

import * as Sentry from '@sentry/node';
import { env } from './env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // We rely on logger for everything else; Sentry just captures
    // unhandled exceptions at the boundary.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
  });
  initialized = true;
  logger.info('[sentry] backend initialized');
}

/**
 * Report only unexpected (non-AppError) failures. AppErrors are the
 * application's contract for 4xx-class signals and shouldn't page anyone.
 */
export function captureExceptionIfNotAppError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (err instanceof AppError) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
