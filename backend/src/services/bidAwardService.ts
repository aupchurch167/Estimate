import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const dec = (n: number | string) => new Prisma.Decimal(n);

export async function awardBid(bidRequestId: string, orgId: string) {
  const request = await prisma.bidRequest.findFirst({
    where: { id: bidRequestId, organizationId: orgId },
    include: {
      bidResponse: true,
      bidPackage: true,
    },
  });
  if (!request) throw new NotFoundError('Bid request not found');
  if (!request.bidResponse) throw new ValidationError('No response to award');
  if (request.bidPackage.status !== 'PUBLISHED' && request.bidPackage.status !== 'CLOSED') {
    throw new ValidationError('Bid package must be PUBLISHED or CLOSED to award');
  }

  await prisma.bidPackage.update({
    where: { id: request.bidPackageId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  const otherRequests = await prisma.bidRequest.findMany({
    where: {
      bidPackageId: request.bidPackageId,
      id: { not: bidRequestId },
      status: { notIn: ['DECLINED', 'EXPIRED'] },
    },
  });

  for (const other of otherRequests) {
    await prisma.bidRequest.update({
      where: { id: other.id },
      data: { status: 'DECLINED', declinedAt: new Date(), declineReason: 'Another vendor was awarded' },
    });
  }

  return { awardedRequestId: bidRequestId, closedPackageId: request.bidPackageId };
}

export async function reconcileToEstimate(
  bidResponseId: string,
  orgId: string,
  estimateId: string,
  scopeSectionId: string,
) {
  const response = await prisma.bidResponse.findFirst({
    where: { id: bidResponseId, organizationId: orgId },
    include: {
      lineItems: { orderBy: { displayOrder: 'asc' } },
      bidRequest: {
        select: { vendorName: true, bidPackage: { select: { tradeCode: true } } },
      },
    },
  });
  if (!response) throw new NotFoundError('Bid response not found');

  const section = await prisma.scopeSection.findFirst({
    where: { id: scopeSectionId, estimateId, organizationId: orgId },
  });
  if (!section) throw new NotFoundError('Scope section not found');

  const maxOrder = await prisma.lineItem.aggregate({
    where: { scopeSectionId },
    _max: { order: true },
  });
  let nextOrder = (maxOrder._max.order ?? 0) + 1;

  const created = [];
  if (response.lineItems.length > 0) {
    for (const li of response.lineItems) {
      const cost = li.totalPrice ?? dec(0);
      const item = await prisma.lineItem.create({
        data: {
          organizationId: orgId,
          estimateId,
          scopeSectionId,
          description: li.description,
          quantity: li.quantity ?? dec(1),
          unitOfMeasure: 'LS',
          unitCostMaterial: li.unitPrice ?? dec(0),
          unitCostLabor: dec(0),
          markupPercent: dec(0),
          lineCost: cost,
          lineSellPrice: cost,
          source: 'BID_RESPONSE',
          status: 'NEEDS_REVIEW',
          order: nextOrder++,
        },
      });
      created.push(item);
    }
  } else if (response.totalAmount) {
    const item = await prisma.lineItem.create({
      data: {
        organizationId: orgId,
        estimateId,
        scopeSectionId,
        description: `${response.bidRequest.vendorName} — ${response.bidRequest.bidPackage.tradeCode ?? 'Sub'} bid`,
        quantity: dec(1),
        unitOfMeasure: 'LS',
        unitCostMaterial: response.totalAmount,
        unitCostLabor: dec(0),
        markupPercent: dec(0),
        lineCost: response.totalAmount,
        lineSellPrice: response.totalAmount,
        source: 'BID_RESPONSE',
        status: 'NEEDS_REVIEW',
        order: nextOrder,
      },
    });
    created.push(item);
  }

  return { lineItemsCreated: created.length, lineItems: created };
}
