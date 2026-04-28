/**
 * Organization service.
 *
 * Reads and updates the authed user's Organization + OrgSettings, and
 * issues signed upload URLs for org-scoped uploads (logo today; estimate
 * exports / source files later).
 */

import { randomBytes } from 'node:crypto';
import type { Organization, OrgSettings, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { generateSignedUploadUrl, type SignedUploadResult } from '../lib/spaces.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const ALLOWED_LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

export interface OrgWithSettings {
  organization: Organization;
  settings: OrgSettings | null;
}

export async function getCurrent(orgId: string): Promise<OrgWithSettings> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { settings: true },
  });
  if (!org) throw new NotFoundError('Organization', orgId);
  const { settings, ...organization } = org;
  return { organization, settings };
}

export interface UpdateOrganizationInput {
  name?: string;
}

export async function updateOrganization(
  orgId: string,
  patch: UpdateOrganizationInput,
): Promise<Organization> {
  return prisma.organization.update({
    where: { id: orgId },
    data: patch,
  });
}

export interface UpdateSettingsInput {
  companyLegalName?: string | null;
  primaryColorHex?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  estimateNumberPrefix?: string;
  defaultMarkupPercent?: string;
  drafterCanSend?: boolean;
  timezone?: string;
  // null = unlimited; this only takes effect when confirmUnlimited === true.
  monthlyAiCostCapUsd?: string | null;
  logoUrl?: string | null;
}

export async function updateSettings(
  orgId: string,
  patch: UpdateSettingsInput,
): Promise<OrgSettings> {
  const data: Prisma.OrgSettingsUpdateInput = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    (data as Record<string, unknown>)[key] = value;
  }

  const existing = await prisma.orgSettings.findUnique({ where: { organizationId: orgId } });
  if (!existing) throw new NotFoundError('OrgSettings', orgId);

  return prisma.orgSettings.update({
    where: { organizationId: orgId },
    data,
  });
}

export async function signLogoUpload(opts: {
  organizationId: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<SignedUploadResult> {
  if (!ALLOWED_LOGO_MIMES.has(opts.contentType)) {
    throw new ValidationError('Unsupported logo file type', {
      allowed: Array.from(ALLOWED_LOGO_MIMES),
      received: opts.contentType,
    });
  }
  if (opts.fileSizeBytes <= 0 || opts.fileSizeBytes > MAX_LOGO_BYTES) {
    throw new ValidationError('Logo exceeds maximum size', {
      maxBytes: MAX_LOGO_BYTES,
      received: opts.fileSizeBytes,
    });
  }
  const ext = mimeToExt(opts.contentType);
  const slug = randomBytes(6).toString('hex');
  const key = `orgs/${opts.organizationId}/logo/${Date.now()}-${slug}.${ext}`;
  return generateSignedUploadUrl({
    key,
    contentType: opts.contentType,
    acl: 'public-read',
  });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}
