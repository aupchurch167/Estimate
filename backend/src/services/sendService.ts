/**
 * Estimate "Send" orchestrator (Phase 4.6).
 *
 * Sending an estimate is the moment it leaves the building: the org has
 * to be confident about everything they're committing to. We model it as
 * an immutable event:
 *   1. Status guard: only APPROVED estimates can be sent.
 *   2. Permission guard: canSendEstimate (admin always; ESTIMATOR drafter
 *      / reviewer when OrgSettings.drafterCanSend is true).
 *   3. Take a SEND snapshot of the APPROVED state.
 *   4. Render the PDF from that snapshot, upload to Spaces, write an
 *      EstimateExport row tied to the snapshot.
 *   5. Atomically: flip Estimate.status to SENT + sentAt = now, write
 *      ESTIMATE_SENT activity event with snapshotId + recipients in meta.
 *   6. Best-effort: dispatch the email with the PDF attached. If email
 *      fails, the status flip stays — the user can resend without
 *      re-snapshotting because the snapshot + export are reusable.
 */

import type { Prisma, Estimate, EstimateSnapshot } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { canSendEstimate } from '../lib/permissions.js';
import { sendRawEmail, type SendEmailResult } from '../lib/email.js';
import { generateSignedDownloadUrl, uploadBuffer } from '../lib/spaces.js';
import { renderEstimatePdf, type PdfEstimateData } from './pdfService.js';
import { createSnapshotInTx } from './snapshotService.js';

const RECIPIENTS_MAX = 10;
const MESSAGE_MAX = 2000;
const SUBJECT_MAX = 200;

export const SEND_METHODS = ['email', 'link', 'download'] as const;
export type SendMethod = (typeof SEND_METHODS)[number];

export interface SendActor {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';
}

export interface SendEstimateInput {
  /** How the user wants to deliver the estimate. Defaults to 'email'. */
  sendMethod?: SendMethod;
  /** Required for sendMethod='email'. Optional + ignored for link / download. */
  recipients?: string[];
  subject?: string | null;
  message?: string | null;
}

export interface SendEstimateResult {
  estimate: Estimate;
  snapshot: EstimateSnapshot;
  exportId: string;
  sendMethod: SendMethod;
  /** 7-day signed download URL — returned for all three methods so the
   *  caller can show it to the user (link/download) or just confirm the
   *  resource exists (email). */
  downloadUrl: string;
  /** Email dispatch result — only populated when sendMethod='email'. */
  email: SendEmailResult | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(input: SendEstimateInput): {
  sendMethod: SendMethod;
  recipients: string[];
  subject: string | null;
  message: string | null;
} {
  const sendMethod: SendMethod = (input.sendMethod ?? 'email') as SendMethod;
  if (!SEND_METHODS.includes(sendMethod)) {
    throw new ValidationError(`Invalid sendMethod: ${sendMethod}`, {
      issues: [{ path: 'sendMethod', message: `Must be one of: ${SEND_METHODS.join(', ')}` }],
    });
  }

  const recipients = Array.from(
    new Set(
      (input.recipients ?? []).map((r) => (typeof r === 'string' ? r.trim() : '')),
    ),
  ).filter((r) => r.length > 0);

  if (sendMethod === 'email' && recipients.length === 0) {
    throw new ValidationError('At least one recipient is required when sending by email', {
      issues: [{ path: 'recipients', message: 'Required for sendMethod=email' }],
    });
  }
  if (recipients.length > RECIPIENTS_MAX) {
    throw new ValidationError(`Too many recipients (max ${RECIPIENTS_MAX})`, {
      issues: [{ path: 'recipients', message: 'Too many' }],
    });
  }
  for (const r of recipients) {
    if (!EMAIL_RX.test(r)) {
      throw new ValidationError(`Invalid email address: ${r}`, {
        issues: [{ path: 'recipients', message: 'Invalid email', code: r }],
      });
    }
  }

  const subject = input.subject?.trim() ?? null;
  if (subject !== null && subject.length > SUBJECT_MAX) {
    throw new ValidationError(`Subject is too long (max ${SUBJECT_MAX} chars)`, {
      issues: [{ path: 'subject', message: 'Too long' }],
    });
  }
  const message = input.message?.trim() ?? null;
  if (message !== null && message.length > MESSAGE_MAX) {
    throw new ValidationError(`Message is too long (max ${MESSAGE_MAX} chars)`, {
      issues: [{ path: 'message', message: 'Too long' }],
    });
  }

  return { sendMethod, recipients, subject, message };
}

export async function sendEstimate(
  organizationId: string,
  actor: SendActor,
  estimateId: string,
  rawInput: SendEstimateInput,
): Promise<SendEstimateResult> {
  const input = validateInput(rawInput);

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    include: { organization: { select: { name: true } } },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);

  const settings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  if (!settings) throw new NotFoundError('OrgSettings', organizationId);

  if (
    !canSendEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
      { drafterCanSend: settings.drafterCanSend },
    )
  ) {
    throw new ForbiddenError('You cannot send this estimate');
  }

  if (estimate.status !== 'APPROVED') {
    throw new ConflictError(
      `Cannot send an estimate while it is ${estimate.status}`,
      'invalid_status_transition',
      { from: estimate.status, expected: ['APPROVED'], attempted: 'SENT' },
    );
  }

  // 1. SEND snapshot of the APPROVED state.
  const snapshot = await prisma.$transaction((tx) =>
    createSnapshotInTx(tx, {
      organizationId,
      estimateId: estimate.id,
      userId: actor.id,
      snapshotType: 'SEND',
    }),
  );

  // 2. Render PDF + upload.
  const pdfData = snapshot.estimateData as unknown as PdfEstimateData;
  const buffer = await renderEstimatePdf(pdfData, {
    organizationName: estimate.organization.name,
    snapshotLabel: `v${snapshot.sequence} · SEND`,
  });
  const key = `exports/${organizationId}/${estimate.id}/${snapshot.id}/send-${Date.now()}.pdf`;
  await uploadBuffer({
    key,
    body: buffer,
    contentType: 'application/pdf',
    acl: 'private',
  });

  // 3. Atomic: write export row + flip status + activity.
  const { updated, exportId } = await prisma.$transaction(async (tx) => {
    const exportRow = await tx.estimateExport.create({
      data: {
        organizationId,
        estimateId: estimate.id,
        snapshotId: snapshot.id,
        exportedById: actor.id,
        format: 'PDF',
        fileUrl: key,
        fileSizeBytes: buffer.length,
      },
    });

    const next = await tx.estimate.update({
      where: { id: estimate.id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'ESTIMATE_SENT',
        entityType: 'Estimate',
        entityId: estimate.id,
        estimateId: estimate.id,
        summary: buildActivitySummary({
          number: estimate.number,
          sendMethod: input.sendMethod,
          recipients: input.recipients,
        }),
        meta: {
          snapshotId: snapshot.id,
          exportId: exportRow.id,
          sendMethod: input.sendMethod,
          recipients: input.recipients,
          subject: input.subject,
          messagePreview: input.message ? input.message.slice(0, 200) : null,
        } as Prisma.InputJsonValue,
      },
    });

    return { updated: next, exportId: exportRow.id };
  });

  // 4. Signed URL — useful in all three methods. For email, it's embedded
  //    in the body. For link, the user copies it. For download, the
  //    frontend opens it in a new tab.
  const downloadUrl = await generateSignedDownloadUrl({
    key,
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  });

  // 5. Email dispatch is best-effort and only happens for sendMethod=email.
  let email: SendEmailResult | null = null;
  if (input.sendMethod === 'email') {
    const subject =
      input.subject ?? `${estimate.organization.name} — Estimate ${estimate.number}`;
    const introLine = `${estimate.organization.name} has sent you estimate ${estimate.number}.`;
    const html = buildHtmlBody({
      subject,
      intro: introLine,
      message: input.message,
      downloadUrl,
      estimateNumber: estimate.number,
    });
    const text = buildTextBody({
      intro: introLine,
      message: input.message,
      downloadUrl,
      estimateNumber: estimate.number,
    });
    email = await sendRawEmail({
      to: input.recipients,
      subject,
      html,
      text,
      attachments: [
        {
          filename: `Estimate-${estimate.number}.pdf`,
          content: buffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  return {
    estimate: updated,
    snapshot,
    exportId,
    sendMethod: input.sendMethod,
    downloadUrl,
    email,
  };
}

function buildActivitySummary(args: {
  number: string;
  sendMethod: SendMethod;
  recipients: string[];
}): string {
  switch (args.sendMethod) {
    case 'email':
      return `Sent estimate ${args.number} via email to ${args.recipients.join(', ')}`;
    case 'link':
      return `Generated a shareable link for estimate ${args.number}`;
    case 'download':
      return `Marked estimate ${args.number} as sent (downloaded for delivery)`;
  }
}

function buildHtmlBody(args: {
  subject: string;
  intro: string;
  message: string | null;
  downloadUrl: string;
  estimateNumber: string;
}): string {
  const safeMessage = args.message
    ? `<p style="margin:16px 0 0; white-space:pre-wrap; font-family: Helvetica, Arial, sans-serif; color:#1a1a1a; line-height:1.5;">${escapeHtml(args.message)}</p>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin:0; padding:24px; background:#FDFAF0; color:#1a1a1a; font-family: Helvetica, Arial, sans-serif;">
    <table style="width:100%; max-width:560px; margin:0 auto; border:1px solid #1a1a1a; background:#FDFAF0;">
      <tr><td style="padding:20px 24px; border-bottom:1px solid #ccc;">
        <p style="margin:0; font-family: monospace; font-size:11px; letter-spacing:0.12em; color:#666;">QUILL · ESTIMATE</p>
        <h1 style="margin:6px 0 0; font-size:18px; line-height:1.3;">${escapeHtml(args.subject)}</h1>
      </td></tr>
      <tr><td style="padding:20px 24px;">
        <p style="margin:0; font-size:14px; line-height:1.5;">${escapeHtml(args.intro)}</p>
        ${safeMessage}
        <p style="margin:24px 0 0; font-size:13px;">
          A copy is attached as a PDF. You can also download it here for the next 7 days:
        </p>
        <p style="margin:8px 0 0;">
          <a href="${escapeAttribute(args.downloadUrl)}"
             style="display:inline-block; padding:10px 18px; border:1px solid #1a1a1a; background:#1a1a1a; color:#FDFAF0; font-family: monospace; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; text-decoration:none;">
            Download Estimate ${escapeHtml(args.estimateNumber)}
          </a>
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function buildTextBody(args: {
  intro: string;
  message: string | null;
  downloadUrl: string;
  estimateNumber: string;
}): string {
  const lines = [args.intro];
  if (args.message) {
    lines.push('');
    lines.push(args.message);
  }
  lines.push('');
  lines.push(`Download (7 days): ${args.downloadUrl}`);
  lines.push('A PDF copy is attached.');
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(s: string): string {
  return s.replace(/"/g, '&quot;');
}
