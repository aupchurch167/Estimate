/**
 * Notification service (Phase 4.8).
 *
 * Inserts an in-app notification row for the recipient and (best-effort)
 * dispatches an email. The Notification table is the source of truth —
 * emails are a courtesy, not a guarantee, so a SendGrid hiccup never
 * rolls back a workflow transition.
 *
 * Callers are workflow services (review-workflow, send, ai-runs) that
 * inject a notify() call alongside their state changes. Each call is
 * idempotent in spirit but not enforced — duplicate notifications are
 * cheap and the recipient can dismiss either.
 */

import type { NotificationType, Notification } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';
import { sendRawEmail } from '../lib/email.js';

const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 100;

export interface NotifyArgs {
  organizationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Optional override email subject; defaults to `title`. */
  emailSubject?: string;
  /** Skip email (in-app only). */
  inAppOnly?: boolean;
}

/**
 * Create a notification row + best-effort email dispatch. Callers should
 * NOT await this in a critical path — failures here log and bail; they
 * never bubble out to break a workflow transition.
 */
export async function notify(args: NotifyArgs): Promise<Notification | null> {
  try {
    const recipient = await prisma.user.findFirst({
      where: {
        id: args.recipientId,
        organizationId: args.organizationId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, email: true, firstName: true },
    });
    if (!recipient) {
      logger.warn(
        { recipientId: args.recipientId, type: args.type },
        '[notify] recipient missing — skipping',
      );
      return null;
    }

    const created = await prisma.notification.create({
      data: {
        organizationId: args.organizationId,
        recipientId: recipient.id,
        type: args.type,
        title: args.title,
        body: args.body ?? null,
        entityType: args.entityType ?? null,
        entityId: args.entityId ?? null,
      },
    });

    if (args.inAppOnly) return created;

    // Email — best-effort. Mark emailSent regardless of dispatch result so
    // a permanent backend failure doesn't generate retry storms.
    const subject = args.emailSubject ?? args.title;
    const html = renderEmailHtml({
      title: args.title,
      body: args.body ?? null,
      recipientFirstName: recipient.firstName,
    });
    const text = renderEmailText({ title: args.title, body: args.body ?? null });
    const result = await sendRawEmail({
      to: recipient.email,
      subject,
      html,
      text,
    });
    await prisma.notification.update({
      where: { id: created.id },
      data: {
        emailSent: result.dispatched,
        emailSentAt: result.dispatched ? new Date() : null,
      },
    });
    return { ...created, emailSent: result.dispatched, emailSentAt: result.dispatched ? new Date() : null };
  } catch (err) {
    logger.error({ err, args }, '[notify] failed — workflow continues');
    return null;
  }
}

export interface ListNotificationsOpts {
  unreadOnly?: boolean;
  limit?: number;
}

export async function listForUser(
  recipientId: string,
  opts: ListNotificationsOpts = {},
): Promise<Notification[]> {
  const take = Math.max(1, Math.min(LIST_MAX_LIMIT, opts.limit ?? LIST_DEFAULT_LIMIT));
  return prisma.notification.findMany({
    where: {
      recipientId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export async function unreadCount(recipientId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId, readAt: null },
  });
}

export async function markRead(
  recipientId: string,
  notificationId: string,
): Promise<Notification> {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId },
  });
  if (!existing) throw new NotFoundError('Notification', notificationId);
  if (existing.readAt) return existing;
  return prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(recipientId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

// ─── Email rendering ─────────────────────────────────────────────────────

function renderEmailHtml(args: {
  title: string;
  body: string | null;
  recipientFirstName: string;
}): string {
  const greeting = args.recipientFirstName
    ? `Hi ${escapeHtml(args.recipientFirstName)},`
    : 'Hi,';
  const safeBody = args.body
    ? `<p style="margin:16px 0 0; white-space:pre-wrap; font-family: Helvetica, Arial, sans-serif; color:#1a1a1a; line-height:1.5;">${escapeHtml(args.body)}</p>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin:0; padding:24px; background:#FDFAF0; color:#1a1a1a; font-family: Helvetica, Arial, sans-serif;">
    <table style="width:100%; max-width:560px; margin:0 auto; border:1px solid #1a1a1a; background:#FDFAF0;">
      <tr><td style="padding:20px 24px; border-bottom:1px solid #ccc;">
        <p style="margin:0; font-family: monospace; font-size:11px; letter-spacing:0.12em; color:#666;">QUILL · NOTIFICATION</p>
        <h1 style="margin:6px 0 0; font-size:18px; line-height:1.3;">${escapeHtml(args.title)}</h1>
      </td></tr>
      <tr><td style="padding:20px 24px;">
        <p style="margin:0; font-size:14px;">${greeting}</p>
        ${safeBody}
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderEmailText(args: { title: string; body: string | null }): string {
  return [args.title, '', args.body ?? ''].filter(Boolean).join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
