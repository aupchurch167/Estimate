import { prisma } from '../lib/prisma.js';
import type { TradeCategory } from '@prisma/client';

export function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function listCanonical(category?: TradeCategory) {
  return prisma.tradeCanonical.findMany({
    where: category ? { category } : undefined,
    orderBy: { displayOrder: 'asc' },
  });
}

export async function getCanonical(id: string) {
  return prisma.tradeCanonical.findUnique({ where: { id } });
}

export async function listMappings(orgId: string) {
  return prisma.tradeMapping.findMany({
    where: { organizationId: orgId },
    include: { tradeCanonical: true },
    orderBy: { rawTrade: 'asc' },
  });
}

export async function createMapping(orgId: string, rawTrade: string, tradeCanonicalId: string) {
  const canonical = await prisma.tradeCanonical.findUnique({
    where: { id: tradeCanonicalId },
  });
  if (!canonical) return null;

  return prisma.tradeMapping.create({
    data: {
      organizationId: orgId,
      rawTrade,
      tradeCanonicalId,
    },
    include: { tradeCanonical: true },
  });
}

export async function updateMapping(id: string, orgId: string, tradeCanonicalId: string) {
  const canonical = await prisma.tradeCanonical.findUnique({
    where: { id: tradeCanonicalId },
  });
  if (!canonical) return null;

  return prisma.tradeMapping.update({
    where: { id, organizationId: orgId },
    data: { tradeCanonicalId },
    include: { tradeCanonical: true },
  });
}

export async function deleteMapping(id: string, orgId: string) {
  return prisma.tradeMapping.delete({
    where: { id, organizationId: orgId },
  });
}

export async function listUnmapped(orgId: string, rawTrades: string[]) {
  const existing = await prisma.tradeMapping.findMany({
    where: { organizationId: orgId },
    select: { rawTrade: true },
  });
  const mappedSet = new Set(existing.map((m) => normalize(m.rawTrade)));
  return rawTrades.filter((t) => !mappedSet.has(normalize(t)));
}

export async function resolve(orgId: string, rawTrade: string) {
  const normalized = normalize(rawTrade);
  const mapping = await prisma.tradeMapping.findFirst({
    where: {
      organizationId: orgId,
      rawTrade: { equals: normalized, mode: 'insensitive' },
    },
    include: { tradeCanonical: true },
  });
  if (mapping) return mapping.tradeCanonical;

  const direct = await prisma.tradeCanonical.findFirst({
    where: { name: { equals: normalized, mode: 'insensitive' } },
  });
  return direct ?? null;
}
