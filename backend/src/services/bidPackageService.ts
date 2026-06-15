import { prisma } from '../lib/prisma.js';
import type { BidPackageStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import * as bidEmailService from './bidEmailService.js';
import crypto from 'crypto';

const INCLUDE_REQUESTS = {
  bidRequests: true,
  tradeCanonical: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  estimate: { select: { id: true, title: true, number: true } },
} as const;

// Detail include adds the package documents and the org name — used by the
// single-package fetch and create response, which back the email preview page.
const INCLUDE_DETAIL = {
  ...INCLUDE_REQUESTS,
  organization: { select: { name: true } },
  bidDocuments: {
    orderBy: { createdAt: 'asc' },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
  },
} as const;

export async function list(orgId: string, estimateId?: string, status?: BidPackageStatus) {
  return prisma.bidPackage.findMany({
    where: {
      organizationId: orgId,
      ...(estimateId ? { estimateId } : {}),
      ...(status ? { status } : {}),
    },
    include: INCLUDE_REQUESTS,
    orderBy: { createdAt: 'desc' },
  });
}

export async function get(id: string, orgId: string) {
  return prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
    include: INCLUDE_DETAIL,
  });
}

export async function create(data: {
  organizationId: string;
  estimateId: string;
  title: string;
  description?: string;
  personalNote?: string;
  tradeCode?: string;
  tradeCanonicalId?: string;
  dueDate?: Date;
  createdById: string;
}) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: data.estimateId, organizationId: data.organizationId },
  });
  if (!estimate) throw new NotFoundError('Estimate not found');

  return prisma.bidPackage.create({
    data: {
      organizationId: data.organizationId,
      estimateId: data.estimateId,
      title: data.title,
      description: data.description,
      personalNote: data.personalNote,
      tradeCode: data.tradeCode,
      tradeCanonicalId: data.tradeCanonicalId,
      dueDate: data.dueDate,
      createdById: data.createdById,
    },
    include: INCLUDE_DETAIL,
  });
}

export async function update(
  id: string,
  orgId: string,
  data: {
    title?: string;
    description?: string | null;
    personalNote?: string | null;
    tradeCode?: string | null;
    tradeCanonicalId?: string | null;
    dueDate?: Date | null;
  },
) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');
  if (pkg.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT bid packages can be edited');
  }

  return prisma.bidPackage.update({
    where: { id },
    data,
    include: INCLUDE_DETAIL,
  });
}

export async function publish(id: string, orgId: string) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
    include: { bidRequests: true },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');
  if (pkg.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT bid packages can be published');
  }
  if (pkg.bidRequests.length === 0) {
    throw new ValidationError('Add at least one vendor before publishing');
  }

  const updated = await prisma.bidPackage.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
    include: INCLUDE_DETAIL,
  });

  const documentNames = updated.bidDocuments.map((d) => d.fileName);

  for (const req of updated.bidRequests) {
    if (req.status === 'PENDING') {
      await prisma.bidRequest.update({
        where: { id: req.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      bidEmailService
        .sendBidInvitation({
          vendorName: req.vendorName,
          vendorEmail: req.vendorEmail,
          orgName: updated.organization.name,
          packageTitle: updated.title,
          tradeName: updated.tradeCanonical?.name,
          dueDate: updated.dueDate?.toLocaleDateString(),
          description: updated.description ?? undefined,
          personalNote: updated.personalNote ?? undefined,
          documentNames,
          accessToken: req.accessToken,
        })
        .catch((err) => logger.error({ err }, 'Bid invitation email failed'));
    }
  }

  // Re-read so the returned payload reflects the SENT statuses set above —
  // the `updated` snapshot serialized its requests before that loop ran.
  return prisma.bidPackage.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_DETAIL,
  });
}

export async function close(id: string, orgId: string) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');
  if (pkg.status !== 'PUBLISHED') {
    throw new ValidationError('Only PUBLISHED bid packages can be closed');
  }

  return prisma.bidPackage.update({
    where: { id },
    data: { status: 'CLOSED', closedAt: new Date() },
    include: INCLUDE_REQUESTS,
  });
}

export async function cancel(id: string, orgId: string) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');
  if (pkg.status === 'CANCELLED') {
    throw new ValidationError('Bid package is already cancelled');
  }

  return prisma.bidPackage.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: INCLUDE_REQUESTS,
  });
}

export async function remove(id: string, orgId: string) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');
  if (pkg.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT bid packages can be deleted');
  }

  await prisma.bidRequest.deleteMany({ where: { bidPackageId: id } });
  await prisma.bidPackage.delete({ where: { id } });
}

// ─── Bid Requests ───────────────────────────────────────────────────────────

export async function addRequest(
  bidPackageId: string,
  orgId: string,
  data: {
    coreVendorId?: string;
    vendorName: string;
    vendorEmail: string;
    vendorPhone?: string;
  },
) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id: bidPackageId, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');

  return prisma.bidRequest.create({
    data: {
      organizationId: orgId,
      bidPackageId,
      coreVendorId: data.coreVendorId,
      vendorName: data.vendorName,
      vendorEmail: data.vendorEmail,
      vendorPhone: data.vendorPhone,
      accessToken: crypto.randomBytes(32).toString('base64url'),
    },
  });
}

export async function removeRequest(requestId: string, orgId: string) {
  const req = await prisma.bidRequest.findFirst({
    where: { id: requestId, organizationId: orgId },
    include: { bidPackage: true },
  });
  if (!req) throw new NotFoundError('Bid request not found');
  if (req.status !== 'PENDING') {
    throw new ValidationError('Only PENDING bid requests can be removed');
  }

  await prisma.bidRequest.delete({ where: { id: requestId } });
}

export async function listRequests(bidPackageId: string, orgId: string) {
  return prisma.bidRequest.findMany({
    where: { bidPackageId, organizationId: orgId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getRequestByToken(accessToken: string) {
  return prisma.bidRequest.findUnique({
    where: { accessToken },
    include: {
      bidPackage: {
        include: {
          estimate: { select: { id: true, title: true, number: true, clientCompanyName: true } },
          tradeCanonical: true,
        },
      },
      organization: { select: { id: true, name: true } },
    },
  });
}

export async function markViewed(accessToken: string) {
  return prisma.bidRequest.update({
    where: { accessToken },
    data: {
      status: 'VIEWED',
      viewedAt: new Date(),
    },
  });
}
