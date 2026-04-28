/**
 * Email dispatcher.
 *
 * - Production: renders the React Email component to HTML + plain text and
 *   ships it via SendGrid.
 * - Development / test: logs the rendered output to the structured logger
 *   instead of sending. Set ENABLE_SENDGRID_IN_DEV=true and a real
 *   SG.* API key if you want to exercise the production path locally.
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

function isLikelyRealKey(key: string): boolean {
  return key.startsWith('SG.') && key.length >= 30;
}

export async function sendEmail({ to, subject, react }: SendEmailParams): Promise<SendEmailResult> {
  const html = await render(react);
  const text = await render(react, { plainText: true });

  const isProd = env.NODE_ENV === 'production';
  if (!isProd || !isLikelyRealKey(env.SENDGRID_API_KEY)) {
    logger.info(
      {
        to,
        subject,
        from: `${env.SENDGRID_FROM_NAME} <${env.SENDGRID_FROM_EMAIL}>`,
        textPreview: text.slice(0, 800),
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
    });
    return { dispatched: true };
  } catch (err) {
    // Email failures should not break the originating action; log and bubble
    // a flag the caller can pass back to the API consumer.
    logger.error({ err, to, subject }, '[email] dispatch failed');
    return { dispatched: false, reason: 'sendgrid_error' };
  }
}
