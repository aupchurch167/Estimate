/**
 * Core entity lookup controllers.
 *
 * These endpoints proxy searches to the Helm Core API so the frontend can
 * find accounts and deals without storing them locally. All handlers return
 * { enabled: false, data: [] } when HELM_CORE_INTEGRATION is off, so the
 * frontend degrades gracefully without special casing.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { core } from '../lib/core.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import * as cacheService from '../services/coreCacheService.js';

function assertAuth(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}


const searchQuery = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

// ─── Accounts ────────────────────────────────────────────────────────────────

export async function searchAccounts(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  if (!core.enabled()) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const result = await core.accounts.list({ search: q.search, limit: q.limit, cursor: q.cursor });
    res.json({ enabled: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Core accounts fetch failed');
    res.json({ enabled: true, data: [] });
  }
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  if (!core.enabled()) {
    res.json({ enabled: false, data: null });
    return;
  }
  try {
    const result = await core.accounts.get(String(req.params.id ?? ''));
    res.json({ enabled: true, ...result });
  } catch (err) {
    logger.error({ err }, 'Core account fetch failed');
    res.status(502).json({ error: { code: 'upstream_error', message: 'Core service error' } });
  }
}

export async function getAccountContacts(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  // Contacts resource not yet in the standalone Core client.
  res.json({ enabled: core.enabled(), data: [] });
}

export async function getAccountDeals(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  if (!core.enabled()) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const result = await core.deals.list({
      accountId: String(req.params.id ?? ''),
      limit: q.limit,
      cursor: q.cursor,
      outcome: '',
    });
    res.json({ enabled: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Core deals fetch failed');
    res.json({ enabled: true, data: [] });
  }
}

export async function getAccountProperties(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  // Properties resource not yet in the standalone Core client.
  res.json({ enabled: core.enabled(), data: [] });
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export async function searchDeals(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  if (!core.enabled()) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const result = await core.deals.list({ search: q.search, limit: q.limit, cursor: q.cursor });
    res.json({ enabled: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Core deals search failed');
    res.json({ enabled: true, data: [] });
  }
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function searchVendors(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  const result = await cacheService.searchVendors(
    req.user!.organizationId,
    q.search,
    q.limit,
  );
  res.json({ enabled: core.enabled(), ...result });
}

export async function getVendor(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const vendor = await cacheService.getVendor(
    req.user!.organizationId,
    String(req.params.id),
  );
  if (!vendor) {
    res.status(404).json({ error: { code: 'not_found', message: 'Vendor not found' } });
    return;
  }
  res.json({ enabled: core.enabled(), data: vendor });
}

export async function syncVendors(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  if (!core.enabled()) {
    res.json({ enabled: false, synced: 0 });
    return;
  }
  try {
    const synced = await cacheService.syncVendors(req.user!.organizationId);
    res.json({ enabled: true, synced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Vendor sync failed');
    res.status(502).json({ error: { code: 'upstream_error', message: 'Core service error' } });
  }
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function searchProjects(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const q = parse(searchQuery, req.query);
  const result = await cacheService.searchProjects(
    req.user!.organizationId,
    q.search,
    q.limit,
  );
  res.json({ enabled: core.enabled(), ...result });
}

export async function getProject(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  const project = await cacheService.getProject(
    req.user!.organizationId,
    String(req.params.id),
  );
  if (!project) {
    res.status(404).json({ error: { code: 'not_found', message: 'Project not found' } });
    return;
  }
  res.json({ enabled: core.enabled(), data: project });
}

export async function syncProjects(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  if (!core.enabled()) {
    res.json({ enabled: false, synced: 0 });
    return;
  }
  try {
    const synced = await cacheService.syncProjects(req.user!.organizationId);
    res.json({ enabled: true, synced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ message: msg }, 'Project sync failed');
    res.status(502).json({ error: { code: 'upstream_error', message: 'Core service error' } });
  }
}
