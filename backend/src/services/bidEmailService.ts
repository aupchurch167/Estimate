import { sendEmail } from '../lib/email.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { BidInvitationEmail } from '../emails/BidInvitationEmail.js';
import { BidResponseReceivedEmail } from '../emails/BidResponseReceivedEmail.js';
import { BidReminderEmail } from '../emails/BidReminderEmail.js';
import React from 'react';

export async function sendBidInvitation(params: {
  vendorName: string;
  vendorEmail: string;
  orgName: string;
  packageTitle: string;
  tradeName?: string;
  dueDate?: string;
  description?: string;
  accessToken: string;
}) {
  const portalUrl = `${env.APP_URL}/bid/${params.accessToken}`;
  try {
    return await sendEmail({
      to: params.vendorEmail,
      subject: `Bid request from ${params.orgName}: ${params.packageTitle}`,
      react: React.createElement(BidInvitationEmail, {
        orgName: params.orgName,
        packageTitle: params.packageTitle,
        tradeName: params.tradeName,
        dueDate: params.dueDate,
        description: params.description,
        portalUrl,
        vendorName: params.vendorName,
      }),
    });
  } catch (err) {
    logger.error({ err, vendorEmail: params.vendorEmail }, 'Failed to send bid invitation');
    return { dispatched: false, reason: 'send_error' };
  }
}

export async function sendBidResponseNotification(params: {
  recipientEmail: string;
  recipientFirstName: string;
  vendorName: string;
  packageTitle: string;
  packageId: string;
  totalAmount?: string;
  lineItemCount: number;
}) {
  const packageUrl = `${env.APP_URL}/app/bid-packages/${params.packageId}`;
  try {
    return await sendEmail({
      to: params.recipientEmail,
      subject: `Bid response received: ${params.vendorName} — ${params.packageTitle}`,
      react: React.createElement(BidResponseReceivedEmail, {
        recipientFirstName: params.recipientFirstName,
        vendorName: params.vendorName,
        packageTitle: params.packageTitle,
        totalAmount: params.totalAmount,
        lineItemCount: params.lineItemCount,
        packageUrl,
      }),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send bid response notification');
    return { dispatched: false, reason: 'send_error' };
  }
}

export async function sendBidReminder(params: {
  vendorName: string;
  vendorEmail: string;
  orgName: string;
  packageTitle: string;
  dueDate?: string;
  accessToken: string;
}) {
  const portalUrl = `${env.APP_URL}/bid/${params.accessToken}`;
  try {
    return await sendEmail({
      to: params.vendorEmail,
      subject: `Reminder: Bid request from ${params.orgName} — ${params.packageTitle}`,
      react: React.createElement(BidReminderEmail, {
        orgName: params.orgName,
        packageTitle: params.packageTitle,
        dueDate: params.dueDate,
        portalUrl,
        vendorName: params.vendorName,
      }),
    });
  } catch (err) {
    logger.error({ err, vendorEmail: params.vendorEmail }, 'Failed to send bid reminder');
    return { dispatched: false, reason: 'send_error' };
  }
}
