/**
 * Proof vendor cache + COI actions.
 *
 * Mirrors coreCacheService: cache-first reads that refresh from Proof and fall
 * back to the local cache when Proof is unreachable, so the bid picker and COI
 * badges stay fast and resilient. Coverage detail is fetched live (not cached).
 */

import type { Prisma, ProofVendorCache } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { proof, type ProofVendor, type CoiRequestInput } from '../lib/proof.js';
import { logger } from '../lib/logger.js';

// COI compliance can change at any time; keep the cache fresh-ish. Webhooks
// (docs/api-v1.md §Webhooks) can later push updates and lengthen this.
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

function isStale(syncedAt: Date): boolean {
  return Date.now() - syncedAt.getTime() > STALE_AFTER_MS;
}

/** Shape a Proof vendor into the columns we persist (list-form fields + COI). */
function toCacheData(v: ProofVendor) {
  return {
    coreVendorId: v.coreVendorId ?? null,
    name: v.name,
    trade: v.trade,
    email: v.email,
    phone: v.phone,
    coiStatus: v.coi.status,
    coiExpiresAt: v.coi.expiresAt,
    coiLastRequestedAt: v.coi.lastRequestedAt ? new Date(v.coi.lastRequestedAt) : null,
  } satisfies Partial<Prisma.ProofVendorCacheUncheckedCreateInput>;
}

async function upsertVendor(orgId: string, v: ProofVendor): Promise<ProofVendorCache> {
  const data = toCacheData(v);
  return prisma.proofVendorCache.upsert({
    where: { organizationId_proofVendorId: { organizationId: orgId, proofVendorId: v.id } },
    update: { ...data, syncedAt: new Date() },
    create: { organizationId: orgId, proofVendorId: v.id, ...data },
  });
}

function cacheWhere(orgId: string, filters: { search?: string; trade?: string; coiStatus?: string }) {
  return {
    organizationId: orgId,
    ...(filters.search
      ? { name: { contains: filters.search, mode: 'insensitive' as const } }
      : {}),
    ...(filters.trade ? { trade: filters.trade } : {}),
    ...(filters.coiStatus ? { coiStatus: filters.coiStatus } : {}),
  };
}

export interface VendorSearchParams {
  search?: string;
  trade?: string;
  coiStatus?: string;
  limit?: number;
}

/**
 * Search the vendor directory. Returns fresh local cache when warm, otherwise
 * refreshes from Proof and returns that; on a Proof error returns stale cache.
 */
export async function searchVendors(orgId: string, params: VendorSearchParams = {}) {
  const limit = params.limit ?? 50;
  const where = cacheWhere(orgId, params);

  const cached = await prisma.proofVendorCache.findMany({
    where,
    orderBy: { name: 'asc' },
    take: limit,
  });

  if (cached.length > 0 && !isStale(cached[0].syncedAt)) {
    return { data: cached, source: 'cache' as const };
  }
  if (!proof.enabled()) {
    return { data: cached, source: 'cache' as const };
  }

  try {
    const fresh = await proof.vendors.list({
      search: params.search,
      trade: params.trade,
      coiStatus: params.coiStatus,
      limit,
    });
    for (const v of fresh.data) await upsertVendor(orgId, v);
    const refreshed = await prisma.proofVendorCache.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
    });
    return { data: refreshed, source: 'proof' as const };
  } catch (err) {
    logger.warn({ err }, 'Proof vendor fetch failed, returning stale cache');
    return { data: cached, source: 'cache' as const };
  }
}

/**
 * Vendor detail including live COI coverages. Falls back to the cached
 * list-form fields (no coverages) when Proof is unreachable.
 */
export async function getVendor(orgId: string, proofVendorId: string): Promise<ProofVendor | null> {
  const cached = await prisma.proofVendorCache.findUnique({
    where: { organizationId_proofVendorId: { organizationId: orgId, proofVendorId } },
  });

  if (proof.enabled()) {
    try {
      const { data: v } = await proof.vendors.get(proofVendorId);
      await upsertVendor(orgId, v);
      return v;
    } catch (err) {
      logger.warn({ err, proofVendorId }, 'Proof vendor detail failed, using cache');
    }
  }

  return cached ? cacheRowToVendor(cached) : null;
}

/** Reconstruct the public vendor shape from a cache row (no coverage detail). */
function cacheRowToVendor(row: ProofVendorCache): ProofVendor {
  return {
    id: row.proofVendorId,
    name: row.name,
    trade: row.trade,
    email: row.email,
    phone: row.phone,
    coreVendorId: row.coreVendorId,
    coi: {
      status: (row.coiStatus as ProofVendor['coi']['status']) ?? 'none',
      expiresAt: row.coiExpiresAt,
      lastRequestedAt: row.coiLastRequestedAt ? row.coiLastRequestedAt.toISOString() : null,
    },
  };
}

/**
 * Trigger a COI request for a vendor. Bumps the cached `lastRequestedAt` so the
 * UI reflects the pending request immediately; the next list refresh reconciles
 * the vendor's status from Proof. Throws ProofApiError (e.g. 409 when a request
 * is already open) for the controller to translate.
 */
export async function requestCoi(orgId: string, proofVendorId: string, body?: CoiRequestInput) {
  if (!proof.enabled()) {
    throw new Error('Proof integration is disabled');
  }
  const { data: request } = await proof.vendors.requestCoi(proofVendorId, body);

  await prisma.proofVendorCache.updateMany({
    where: { organizationId: orgId, proofVendorId },
    data: { coiLastRequestedAt: new Date(request.requestedAt) },
  });

  return request;
}

export async function listCoiRequests(
  proofVendorId: string,
  params?: { cursor?: string; limit?: number },
) {
  if (!proof.enabled()) return { data: [], nextCursor: null, hasMore: false };
  return proof.vendors.listCoiRequests(proofVendorId, params);
}
