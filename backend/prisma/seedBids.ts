import type { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export async function seedBids(
  prisma: PrismaClient,
  orgId: string,
  estimateId: string,
  createdById: string,
) {
  const electricalTrade = await prisma.tradeCanonical.findUnique({
    where: { code: 'E' },
  });
  const plumbingTrade = await prisma.tradeCanonical.findUnique({
    where: { code: 'P' },
  });
  const hvacTrade = await prisma.tradeCanonical.findUnique({
    where: { code: 'M' },
  });

  const elecPkg = await prisma.bidPackage.create({
    data: {
      organizationId: orgId,
      estimateId,
      title: 'Electrical — Warehouse Buildout',
      description: 'Full electrical scope for the 25,000 SF warehouse buildout. See attached plans for panel schedule and lighting layout.',
      tradeCode: 'E',
      tradeCanonicalId: electricalTrade?.id,
      status: 'PUBLISHED',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      createdById,
    },
  });

  await prisma.bidRequest.create({
    data: {
      organizationId: orgId,
      bidPackageId: elecPkg.id,
      vendorName: 'Apex Electrical Inc.',
      vendorEmail: 'bids@apexelectrical.com',
      status: 'RESPONDED',
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      viewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      respondedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      accessToken: crypto.randomBytes(32).toString('base64url'),
    },
  });

  await prisma.bidRequest.create({
    data: {
      organizationId: orgId,
      bidPackageId: elecPkg.id,
      vendorName: 'Metro Electrical Services',
      vendorEmail: 'quotes@metroelectric.com',
      status: 'VIEWED',
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      viewedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      accessToken: crypto.randomBytes(32).toString('base64url'),
    },
  });

  await prisma.bidRequest.create({
    data: {
      organizationId: orgId,
      bidPackageId: elecPkg.id,
      vendorName: 'Carolina Power & Light',
      vendorEmail: 'biddesk@cplelectrical.com',
      status: 'SENT',
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      accessToken: crypto.randomBytes(32).toString('base64url'),
    },
  });

  const plumbingPkg = await prisma.bidPackage.create({
    data: {
      organizationId: orgId,
      estimateId,
      title: 'Plumbing — Warehouse Buildout',
      description: 'Rough and finish plumbing for restrooms, break room, and floor drains.',
      tradeCode: 'P',
      tradeCanonicalId: plumbingTrade?.id,
      status: 'DRAFT',
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdById,
    },
  });

  await prisma.bidRequest.create({
    data: {
      organizationId: orgId,
      bidPackageId: plumbingPkg.id,
      vendorName: 'Davis Plumbing Co.',
      vendorEmail: 'estimating@davisplumbing.com',
      status: 'PENDING',
      accessToken: crypto.randomBytes(32).toString('base64url'),
    },
  });

  await prisma.bidPackage.create({
    data: {
      organizationId: orgId,
      estimateId,
      title: 'HVAC — Warehouse Buildout',
      description: 'Complete HVAC system — rooftop units, ductwork, controls.',
      tradeCode: 'M',
      tradeCanonicalId: hvacTrade?.id,
      status: 'CLOSED',
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdById,
    },
  });

  console.log(`[seedBids] created 3 bid packages, 4 bid requests for estimate ${estimateId}`);
}
