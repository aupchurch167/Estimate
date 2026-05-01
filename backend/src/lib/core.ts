import { createCoreClient } from '@helm/sdk';
import type { CoreClient } from '@helm/sdk';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Returns a scoped Core API client for the given org and acting user,
 * or null when HELM_CORE_INTEGRATION is off (the default).
 *
 * Always null-check the return value before calling any Core methods.
 * The flag-off path must always work without a Core dependency at runtime.
 */
export function getCoreClient(orgSlug: string, userId: string): CoreClient | null {
  if (!env.HELM_CORE_INTEGRATION) return null;

  if (!env.CORE_API_URL) {
    logger.error('HELM_CORE_INTEGRATION is enabled but CORE_API_URL is not set');
    return null;
  }

  const devBypass =
    env.NODE_ENV === 'development' && env.CORE_DEV_USER_ID
      ? { userId: env.CORE_DEV_USER_ID, orgSlug }
      : undefined;

  return createCoreClient({
    baseUrl: env.CORE_API_URL,
    orgSlug,
    userId,
    devBypass,
  });
}
