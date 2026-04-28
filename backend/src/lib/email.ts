/**
 * Email dispatcher.
 *
 * - Production: renders the React Email component to HTML + plain text and
 *   ships it via SendGrid.
 * - Development / test: logs the rendered output to the structured logger
 *   instead of sending. Set ENABLE_SENDGRID_IN_DEV=true and a real
 *   SG.* API key if you want to exercise the production path locally.
 *
 * Tests can swap in a fake dispatcher with __setEmailDispatcherForTesting
 * to assert outgoing payloads without touching SendGrid or the logger.
 */

import sgMail from '@sendgrid/mail';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { env } from './env.js';
import { logger } from './logger.js';

let configured = false;

function configureSendgrid(): void {
  if (configured) return;
  sgMail.setApiKey(env.SENDGRID_API_KEY);
  configured = true;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface SendEmailResult {
  dispatched: boolean;
  htmlPreviewUrl?: string;
  reason?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendRawEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailDispatcher {
  send: (input: SendRawEmailParams) => Promise<SendEmailResult>;
}

let dispatcherOverride: EmailDispatcher | undefined;

/** Tests only — pass undefined to restore the real dispatcher. */
export function __setEmailDispatcherForTesting(fake: EmailDispatcher | undefined): void {
  dispatcherOverride = fake;
}

function isLikelyRealKey(key: string): boolean {
  return key.startsWith('SG.') && key.length >= 30;
}

const realDispatcher: EmailDispatcher = {
  async send({ to, subject, html, text, attachments }) {
    const isProd = env.NODE_ENV === 'production';
    if (!isProd || !isLikelyRealKey(env.SENDGRID_API_KEY)) {
      logger.info(
        {
          to,
          subject,
          from: `${env.SENDGRID_FROM_NAME} <${env.SENDGRID_FROM_EMAIL}>`,
          textPreview: text.slice(0, 800),
          attachmentCount: attachments?.length ?? 0,
        },
        '[email] dev mode — not sent',
      );
      return { dispatched: false, reason: 'dev_mode_or_placeholder_key' };
    }

    try {
      configureSendgrid();
      await sgMail.send({
        to,
        from: { email: env.SENDGRID_FROM_EMAIL, name: env.SENDGRID_FROM_NAME },
        subject,
        html,
        text,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          type: a.contentType,
          content: a.content.toString('base64'),
          disposition: 'attachment',
        })),
      });
      return { dispatched: true };
    } catch (err) {
      logger.error({ err, to, subject }, '[email] dispatch failed');
      return { dispatched: false, reason: 'sendgrid_error' };
    }
  },
};

function dispatcher(): EmailDispatcher {
  return dispatcherOverride ?? realDispatcher;
}

export async function sendEmail({ to, subject, react }: SendEmailParams): Promise<SendEmailResult> {
  const html = await render(react);
  const text = await render(react, { plainText: true });
  return dispatcher().send({ to, subject, html, text });
}

export async function sendRawEmail(params: SendRawEmailParams): Promise<SendEmailResult> {
  return dispatcher().send(params);
}
