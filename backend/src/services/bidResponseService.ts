import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { BidSubmissionSource } from '@prisma/client';

const dec = (n: number | string) => new Prisma.Decimal(n);

const INCLUDE_FULL = {
  lineItems: { orderBy: { displayOrder: 'asc' as const } },
  attachments: true,
  bidRequest: {
    select: {
      id: true,
      vendorName: true,
      vendorEmail: true,
      bidPackageId: true,
      bidPackage: {
        select: { id: true, title: true, estimateId: true },
      },
    },
  },
} as const;

export async function getByBidRequest(bidRequestId: string) {
  return prisma.bidResponse.findUnique({
    where: { bidRequestId },
    include: INCLUDE_FULL,
  });
}

export async function listByBidPackage(bidPackageId: string, orgId: string) {
  return prisma.bidResponse.findMany({
    where: {
      organizationId: orgId,
      bidRequest: { bidPackageId },
    },
    include: INCLUDE_FULL,
    orderBy: { submittedAt: 'desc' },
  });
}

export async function submit(
  bidRequestId: string,
  data: {
    submissionSource?: BidSubmissionSource;
    totalAmount?: number;
    notes?: string;
    lineItems?: Array<{
      description: string;
      quantity?: number;
      unit?: string;
      unitPrice?: number;
      totalPrice?: number;
      notes?: string;
    }>;
  },
) {
  const request = await prisma.bidRequest.findUnique({
    where: { id: bidRequestId },
    include: { bidPackage: true, bidResponse: true },
  });
  if (!request) throw new NotFoundError('Bid request not found');
  if (request.bidResponse) throw new ValidationError('Response already submitted');
  if (request.bidPackage.status !== 'PUBLISHED') {
    throw new ValidationError('Bid package is not accepting responses');
  }

  const response = await prisma.bidResponse.create({
    data: {
      organizationId: request.organizationId,
      bidRequestId,
      submissionSource: data.submissionSource ?? 'PORTAL',
      totalAmount: data.totalAmount != null ? dec(data.totalAmount) : null,
      notes: data.notes,
      lineItems: data.lineItems
        ? {
            create: data.lineItems.map((li, i) => ({
              description: li.description,
              quantity: li.quantity != null ? dec(li.quantity) : null,
              unit: li.unit,
              unitPrice: li.unitPrice != null ? dec(li.unitPrice) : null,
              totalPrice: li.totalPrice != null ? dec(li.totalPrice) : null,
              notes: li.notes,
              displayOrder: i + 1,
            })),
          }
        : undefined,
    },
    include: INCLUDE_FULL,
  });

  await prisma.bidRequest.update({
    where: { id: bidRequestId },
    data: { status: 'RESPONDED', respondedAt: new Date() },
  });

  return response;
}

export async function submitViaPortal(
  accessToken: string,
  data: {
    totalAmount?: number;
    notes?: string;
    lineItems?: Array<{
      description: string;
      quantity?: number;
      unit?: string;
      unitPrice?: number;
      totalPrice?: number;
      notes?: string;
    }>;
  },
) {
  const request = await prisma.bidRequest.findUnique({
    where: { accessToken },
  });
  if (!request) throw new NotFoundError('Invalid access token');

  return submit(request.id, { ...data, submissionSource: 'PORTAL' });
}

export async function addAttachment(
  bidResponseId: string,
  orgId: string,
  data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string },
) {
  const response = await prisma.bidResponse.findFirst({
    where: { id: bidResponseId, organizationId: orgId },
  });
  if (!response) throw new NotFoundError('Bid response not found');

  return prisma.bidResponseAttachment.create({
    data: {
      bidResponseId,
      ...data,
    },
  });
}

// ─── Bid Documents (scope docs uploaded by the estimator) ───────────────────

export async function listDocuments(bidPackageId: string, orgId: string) {
  return prisma.bidDocument.findMany({
    where: { bidPackageId, organizationId: orgId },
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addDocument(
  bidPackageId: string,
  orgId: string,
  uploadedById: string,
  data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string },
) {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id: bidPackageId, organizationId: orgId },
  });
  if (!pkg) throw new NotFoundError('Bid package not found');

  return prisma.bidDocument.create({
    data: {
      organizationId: orgId,
      bidPackageId,
      uploadedById,
      ...data,
    },
  });
}

export async function removeDocument(docId: string, orgId: string) {
  const doc = await prisma.bidDocument.findFirst({
    where: { id: docId, organizationId: orgId },
  });
  if (!doc) throw new NotFoundError('Document not found');

  await prisma.bidDocument.delete({ where: { id: docId } });
}
