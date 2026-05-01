/**
 * Core entity lookup controllers.
 *
 * These endpoints proxy searches to the Helm Core API so the frontend can
 * find accounts, deals, properties, and vendors without storing them locally.
 * All handlers return { enabled: false, data: [] } when HELM_CORE_INTEGRATION
 * is off, so the frontend can degrade gracefully without special casing.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { CoreApiError } from '@helm/sdk';
import { getCoreClient } from '../lib/core.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function assertOrg(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return { orgSlug: req.organization.slug, userId: req.user.id };
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
    if (err.isNotFound) {
      res.status(404).json({ error: { code: 'not_found', message: 'Not found in Core' } });
      return true;
    }
    if (err.isUnauthorized) {
      res.status(401).json({ error: { code: 'not_authenticated', message: 'Session expired' } });
      return true;
    }
    if (err.isValidation) {
      res.status(400).json({ error: { code: 'validation_error', message: err.message, details: err.details } });
      return true;
    }
    logger.error('Core API error', { status: err.status, code: err.code });
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
  const { orgSlug, userId } = assertOrg(req);
  const q = parse(searchQuery, req.query);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
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
  const { orgSlug, userId } = assertOrg(req);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
    res.json({ enabled: false, data: null });
    return;
  }
  try {
    const { data } = await core.accounts.get(String(req.params.id ?? ''));
    res.json({ enabled: true, data });
  } catch (err) {
    if (!handleCoreError(err, res)) throw err;
  }
}

export async function getAccountContacts(req: Request, res: Response): Promise<void> {
  const { orgSlug, userId } = assertOrg(req);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const { data } = await core.accounts.listContacts(String(req.params.id ?? ''));
    res.json({ enabled: true, data });
  } catch (err) {
    if (!handleCoreError(err, res)) throw err;
  }
}

export async function getAccountDeals(req: Request, res: Response): Promise<void> {
  const { orgSlug, userId } = assertOrg(req);
  const q = parse(searchQuery, req.query);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
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
  const { orgSlug, userId } = assertOrg(req);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const { data } = await core.properties.list({ accountId: String(req.params.id ?? '') });
    res.json({ enabled: true, data });
  } catch (err) {
    if (!handleCoreError(err, res)) throw err;
  }
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function searchVendors(req: Request, res: Response): Promise<void> {
  const { orgSlug, userId } = assertOrg(req);
  const q = parse(searchQuery, req.query);
  const core = getCoreClient(orgSlug, userId);
  if (!core) {
    res.json({ enabled: false, data: [] });
    return;
  }
  try {
    const result = await core.vendors.list({ search: q.search, limit: q.limit, cursor: q.cursor });
    res.json({ enabled: true, ...result });
  } catch (err) {
    if (!handleCoreError(err, res)) throw err;
  }
}
