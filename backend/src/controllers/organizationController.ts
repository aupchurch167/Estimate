/**
 * Organization HTTP controllers.
 *
 * Validation (Zod) here is the gatekeeper for hex colors, markup percents,
 * estimate-number prefixes, IANA timezones, and the AI cost cap (including
 * the explicit confirmUnlimited handshake when setting it to null).
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as orgService from '../services/organizationService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

// IANA timezone validator. Use Intl.supportedValuesOf when available
// (Node 18.13+), fall back to a static US/Canada allowlist.
const STATIC_TIMEZONES = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'UTC',
]);

function isValidTimezone(tz: string): boolean {
  type SupportedValuesOf = (key: string) => string[];
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: SupportedValuesOf })
    .supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    try {
      return supportedValuesOf('timeZone').includes(tz);
    } catch {
      return STATIC_TIMEZONES.has(tz);
    }
  }
  return STATIC_TIMEZONES.has(tz);
}

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #1A1A1A');

const estimatePrefix = z
  .string()
  .regex(/^[a-zA-Z0-9]{2,5}$/, 'Prefix must be 2–5 letters or digits')
  .transform((s) => s.toUpperCase());

const markupPercent = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Markup must be a decimal between 0 and 1')
  .refine((v) => {
    const n = Number(v);
    return n >= 0 && n <= 1;
  }, 'Markup must be between 0 and 1');

const monthlyAiCostCap = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Monthly cap must be a non-negative number')
  .refine((v) => Number(v) >= 0, 'Monthly cap must be ≥ 0');

const orgPatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
});

const settingsPatchBody = z
  .object({
    companyLegalName: z.string().min(1).max(120).nullable().optional(),
    primaryColorHex: hexColor.optional(),
    contactPhone: z.string().min(1).max(40).nullable().optional(),
    contactEmail: z.string().email().max(254).nullable().optional(),
    addressLine1: z.string().max(120).nullable().optional(),
    addressLine2: z.string().max(120).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
    state: z.string().max(40).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    estimateNumberPrefix: estimatePrefix.optional(),
    defaultMarkupPercent: markupPercent.optional(),
    drafterCanSend: z.boolean().optional(),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimezone, 'Unknown IANA timezone')
      .optional(),
    monthlyAiCostCapUsd: monthlyAiCostCap.nullable().optional(),
    confirmUnlimited: z.boolean().optional(),
    logoUrl: z.string().url().nullable().optional(),
  })
  .refine(
    (v) => {
      // Setting cap to null requires explicit confirmUnlimited:true.
      if (v.monthlyAiCostCapUsd === null) {
        return v.confirmUnlimited === true;
      }
      return true;
    },
    {
      path: ['monthlyAiCostCapUsd'],
      message: 'Setting monthlyAiCostCapUsd to null requires confirmUnlimited: true',
    },
  );

const logoBody = z.object({
  contentType: z.string().min(1).max(80),
  fileSizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function assertOrg(req: Request): string {
  if (!req.organization) {
    throw new ForbiddenError('Not authenticated');
  }
  return req.organization.id;
}

export async function getCurrent(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const data = await orgService.getCurrent(orgId);
  ok(res, data);
}

export async function patchOrganization(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const patch = parse(orgPatchBody, req.body);
  const organization = await orgService.updateOrganization(orgId, patch);
  ok(res, { organization });
}

export async function patchSettings(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(settingsPatchBody, req.body);
  const { confirmUnlimited: _ignored, ...patch } = input;
  const settings = await orgService.updateSettings(orgId, patch);
  ok(res, { settings });
}

export async function signLogoUpload(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(logoBody, req.body);
  const signed = await orgService.signLogoUpload({
    organizationId: orgId,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
  });
  ok(res, signed);
}
