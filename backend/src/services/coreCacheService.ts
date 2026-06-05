import { prisma } from '../lib/prisma.js';
import { core } from '../lib/core.js';
import { logger } from '../lib/logger.js';

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

function isStale(syncedAt: Date): boolean {
  return Date.now() - syncedAt.getTime() > STALE_AFTER_MS;
}

// ─── Vendors ────────────────────────────────────────────────────────────────

export async function syncVendors(orgId: string): Promise<number> {
  if (!core.enabled()) return 0;

  let synced = 0;
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await core.vendors.list({ limit: 200, cursor });
    for (const v of page.data) {
      await prisma.coreVendorCache.upsert({
        where: { organizationId_coreVendorId: { organizationId: orgId, coreVendorId: v.id } },
        update: {
          name: v.name,
          trade: v.trade,
          complianceStatus: v.complianceStatus,
          email: v.email,
          phone: v.phone,
          syncedAt: new Date(),
        },
        create: {
          organizationId: orgId,
          coreVendorId: v.id,
          name: v.name,
          trade: v.trade,
          complianceStatus: v.complianceStatus,
          email: v.email,
          phone: v.phone,
        },
      });
      synced++;
    }
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;
  }

  logger.info({ orgId, synced }, 'Vendor cache synced');
  return synced;
}

export async function searchVendors(
  orgId: string,
  search?: string,
  limit = 50,
) {
  const cached = await prisma.coreVendorCache.findMany({
    where: {
      organizationId: orgId,
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: limit,
  });

  if (cached.length > 0 && !isStale(cached[0].syncedAt)) {
    return { data: cached, source: 'cache' as const };
  }

  if (!core.enabled()) {
    return { data: cached, source: 'cache' as const };
  }

  try {
    const fresh = await core.vendors.list({ search, limit });
    for (const v of fresh.data) {
      await prisma.coreVendorCache.upsert({
        where: { organizationId_coreVendorId: { organizationId: orgId, coreVendorId: v.id } },
        update: {
          name: v.name,
          trade: v.trade,
          complianceStatus: v.complianceStatus,
          email: v.email,
          phone: v.phone,
          syncedAt: new Date(),
        },
        create: {
          organizationId: orgId,
          coreVendorId: v.id,
          name: v.name,
          trade: v.trade,
          complianceStatus: v.complianceStatus,
          email: v.email,
          phone: v.phone,
        },
      });
    }
    const refreshed = await prisma.coreVendorCache.findMany({
      where: {
        organizationId: orgId,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return { data: refreshed, source: 'core' as const };
  } catch (err) {
    logger.warn({ err }, 'Core vendor fetch failed, returning stale cache');
    return { data: cached, source: 'cache' as const };
  }
}

export async function getVendor(orgId: string, coreVendorId: string) {
  const cached = await prisma.coreVendorCache.findUnique({
    where: { organizationId_coreVendorId: { organizationId: orgId, coreVendorId } },
  });

  if (cached && !isStale(cached.syncedAt)) return cached;

  if (!core.enabled()) return cached;

  try {
    const { data: v } = await core.vendors.get(coreVendorId);
    return prisma.coreVendorCache.upsert({
      where: { organizationId_coreVendorId: { organizationId: orgId, coreVendorId } },
      update: {
        name: v.name,
        trade: v.trade,
        complianceStatus: v.complianceStatus,
        email: v.email,
        phone: v.phone,
        syncedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        coreVendorId: v.id,
        name: v.name,
        trade: v.trade,
        complianceStatus: v.complianceStatus,
        email: v.email,
        phone: v.phone,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Core vendor get failed, returning stale cache');
    return cached;
  }
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function syncProjects(orgId: string): Promise<number> {
  if (!core.enabled()) return 0;

  let synced = 0;
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await core.projects.list({ limit: 200, cursor });
    for (const p of page.data) {
      await prisma.coreProjectCache.upsert({
        where: { organizationId_coreProjectId: { organizationId: orgId, coreProjectId: p.id } },
        update: {
          name: p.name,
          status: p.status,
          coreAccountId: p.accountId,
          syncedAt: new Date(),
        },
        create: {
          organizationId: orgId,
          coreProjectId: p.id,
          name: p.name,
          status: p.status,
          coreAccountId: p.accountId,
        },
      });
      synced++;
    }
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;
  }

  logger.info({ orgId, synced }, 'Project cache synced');
  return synced;
}

export async function searchProjects(
  orgId: string,
  search?: string,
  limit = 50,
) {
  const cached = await prisma.coreProjectCache.findMany({
    where: {
      organizationId: orgId,
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: limit,
  });

  if (cached.length > 0 && !isStale(cached[0].syncedAt)) {
    return { data: cached, source: 'cache' as const };
  }

  if (!core.enabled()) {
    return { data: cached, source: 'cache' as const };
  }

  try {
    const fresh = await core.projects.list({ search, limit });
    for (const p of fresh.data) {
      await prisma.coreProjectCache.upsert({
        where: { organizationId_coreProjectId: { organizationId: orgId, coreProjectId: p.id } },
        update: {
          name: p.name,
          status: p.status,
          coreAccountId: p.accountId,
          syncedAt: new Date(),
        },
        create: {
          organizationId: orgId,
          coreProjectId: p.id,
          name: p.name,
          status: p.status,
          coreAccountId: p.accountId,
        },
      });
    }
    const refreshed = await prisma.coreProjectCache.findMany({
      where: {
        organizationId: orgId,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return { data: refreshed, source: 'core' as const };
  } catch (err) {
    logger.warn({ err }, 'Core project fetch failed, returning stale cache');
    return { data: cached, source: 'cache' as const };
  }
}

export async function getProject(orgId: string, coreProjectId: string) {
  const cached = await prisma.coreProjectCache.findUnique({
    where: { organizationId_coreProjectId: { organizationId: orgId, coreProjectId } },
  });

  if (cached && !isStale(cached.syncedAt)) return cached;

  if (!core.enabled()) return cached;

  try {
    const { data: p } = await core.projects.get(coreProjectId);
    return prisma.coreProjectCache.upsert({
      where: { organizationId_coreProjectId: { organizationId: orgId, coreProjectId } },
      update: {
        name: p.name,
        status: p.status,
        coreAccountId: p.accountId,
        syncedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        coreProjectId: p.id,
        name: p.name,
        status: p.status,
        coreAccountId: p.accountId,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Core project get failed, returning stale cache');
    return cached;
  }
}
