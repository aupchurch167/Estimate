/**
 * Frontend Sentry integration (Phase 10.4).
 *
 * Initialized once at module load — main.tsx imports this before
 * rendering. No-ops cleanly when VITE_SENTRY_DSN is empty so dev
 * builds and unit tests don't open network connections.
 */

import * as Sentry from '@sentry/react';
import { env } from './env';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!env.VITE_SENTRY_DSN) return;
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    // Capture unhandled errors only — no performance / replay traffic
    // for the MVP; that doubles bundle size and isn't earning its keep
    // until we have real user volume.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  initialized = true;
}

export { Sentry };
