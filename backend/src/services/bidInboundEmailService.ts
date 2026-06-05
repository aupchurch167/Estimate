import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import * as bidResponseService from './bidResponseService.js';
import * as bidEmailService from './bidEmailService.js';

export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const REPLY_ADDRESS_PATTERN = /^bid\+([A-Za-z0-9_-]+)@/;

function extractTokenFromAddress(to: string): string | null {
  const match = to.match(REPLY_ADDRESS_PATTERN);
  return match ? match[1] : null;
}

function extractAmountFromText(text: string): number | null {
  const patterns = [
    /total[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i,
    /bid[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i,
    /amount[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i,
    /price[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i,
    /\$\s*([\d,]+(?:\.\d{1,2})?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, '');
      const amount = parseFloat(cleaned);
      if (!isNaN(amount) && amount > 0) return amount;
    }
  }
  return null;
}

function cleanEmailText(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    if (/^(On .+ wrote:|>|---+|From:|Sent:|To:|Subject:|Date:)/i.test(line.trim())) break;
    cleaned.push(line);
  }
  return cleaned.join('\n').trim();
}

export async function processInboundEmail(email: InboundEmail) {
  const token = extractTokenFromAddress(email.to);
  if (!token) {
    logger.warn({ to: email.to }, 'Inbound bid email: no token in address');
    return { processed: false, reason: 'no_token' };
  }

  const bidRequest = await prisma.bidRequest.findUnique({
    where: { accessToken: token },
    include: {
      bidPackage: true,
      bidResponse: true,
    },
  });

  if (!bidRequest) {
    logger.warn({ token }, 'Inbound bid email: unknown token');
    return { processed: false, reason: 'unknown_token' };
  }

  if (bidRequest.bidResponse) {
    logger.info({ bidRequestId: bidRequest.id }, 'Inbound bid email: response already exists');
    return { processed: false, reason: 'already_responded' };
  }

  if (bidRequest.bidPackage.status !== 'PUBLISHED') {
    logger.info({ bidRequestId: bidRequest.id }, 'Inbound bid email: package not published');
    return { processed: false, reason: 'package_not_published' };
  }

  const bodyText = cleanEmailText(email.text);
  const totalAmount = extractAmountFromText(bodyText);

  try {
    const response = await bidResponseService.submit(bidRequest.id, {
      submissionSource: 'EMAIL',
      totalAmount: totalAmount ?? undefined,
      notes: bodyText || undefined,
    });

    const creator = await prisma.user.findFirst({
      where: { id: bidRequest.bidPackage.createdById },
    });

    if (creator) {
      bidEmailService
        .sendBidResponseNotification({
          recipientEmail: creator.email,
          recipientFirstName: creator.firstName,
          vendorName: bidRequest.vendorName,
          packageTitle: bidRequest.bidPackage.title,
          packageId: bidRequest.bidPackageId,
          totalAmount: totalAmount?.toString(),
          lineItemCount: 0,
        })
        .catch((err) => logger.error({ err }, 'Failed to notify about email bid response'));
    }

    logger.info(
      { bidRequestId: bidRequest.id, responseId: response.id, totalAmount },
      'Inbound bid email processed',
    );

    return { processed: true, responseId: response.id, totalAmount };
  } catch (err) {
    logger.error({ err, bidRequestId: bidRequest.id }, 'Failed to process inbound bid email');
    return { processed: false, reason: 'submit_error' };
  }
}
