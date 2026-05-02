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
import { core, CoreApiError } from '../lib/core.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

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

function handleCoreError(err: unknown, res: Response): boolean {
  if (err instanceof CoreApiError) {
    if (err.status === 404) {
      res.status(404).json({ error: { code: 'not_found', message: 'Not found in Core' } });
      return true;
    }
    if (err.status === 401) {
      res.status(401).json({ error: { code: 'not_authenticated', message: 'Core auth failed' } });
      return true;
    }
    logger.error('Core API error', { status: err.status, message: err.message });
    res.status(502).json({ error: { code: 'upstream_error', message: 'Core service error' } });
    return true;
  }
  return false;
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
    if (!handleCoreError(err, res)) throw err;
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
    if (!handleCoreError(err, res)) throw err;
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
    });
    res.json({ enabled: true, ...result });
  } catch (err) {
    if (!handleCoreError(err, res)) throw err;
  }
}

export async function getAccountProperties(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  // Properties resource not yet in the standalone Core client.
  res.json({ enabled: core.enabled(), data: [] });
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function searchVendors(req: Request, res: Response): Promise<void> {
  assertAuth(req);
  // Vendors resource not yet in the standalone Core client.
  res.json({ enabled: core.enabled(), data: [] });
}
