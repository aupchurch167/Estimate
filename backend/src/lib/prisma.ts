/**
 * Singleton Prisma client.
 *
 * Reuses one PrismaClient across the process — and across `tsx watch`
 * reloads — to avoid exhausting Postgres connections during dev.
 *
 * Logging:
 * - development: query + warn + error (verbose, useful while iterating)
 * - production:  warn + error only
 */

import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

type GlobalWithPrisma = typeof globalThis & { __quillPrisma?: PrismaClient };
const globalForPrisma = globalThis as GlobalWithPrisma;

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__quillPrisma ?? createClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.__quillPrisma = prisma;
}
