import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export async function scheduleReminders(
  bidPackageId: string,
  orgId: string,
  scheduledFor: Date,
) {
  const requests = await prisma.bidRequest.findMany({
    where: {
      bidPackageId,
      organizationId: orgId,
      status: { in: ['PENDING', 'SENT', 'VIEWED'] },
    },
  });

  const created = [];
  for (const req of requests) {
    const existing = await prisma.bidReminder.findFirst({
      where: {
        bidRequestId: req.id,
        status: 'SCHEDULED',
      },
    });
    if (existing) continue;

    const reminder = await prisma.bidReminder.create({
      data: {
        organizationId: orgId,
        bidRequestId: req.id,
        scheduledFor,
      },
    });
    created.push(reminder);
  }

  return created;
}

export async function cancelReminders(bidRequestId: string) {
  return prisma.bidReminder.updateMany({
    where: { bidRequestId, status: 'SCHEDULED' },
    data: { status: 'SKIPPED' },
  });
}

export async function cancelAllForPackage(bidPackageId: string) {
  const requests = await prisma.bidRequest.findMany({
    where: { bidPackageId },
    select: { id: true },
  });
  const ids = requests.map((r) => r.id);
  if (ids.length === 0) return;

  return prisma.bidReminder.updateMany({
    where: { bidRequestId: { in: ids }, status: 'SCHEDULED' },
    data: { status: 'SKIPPED' },
  });
}

export async function listReminders(bidPackageId: string, orgId: string) {
  return prisma.bidReminder.findMany({
    where: {
      organizationId: orgId,
      bidRequest: { bidPackageId },
    },
    include: {
      bidRequest: {
        select: { id: true, vendorName: true, vendorEmail: true, status: true },
      },
    },
    orderBy: { scheduledFor: 'asc' },
  });
}

export async function processDueReminders() {
  const now = new Date();
  const due = await prisma.bidReminder.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: now },
    },
    include: {
      bidRequest: {
        include: {
          bidPackage: { select: { id: true, title: true, status: true } },
        },
      },
      organization: { select: { id: true, name: true } },
    },
    take: 100,
  });

  let sent = 0;
  let skipped = 0;

  for (const reminder of due) {
    if (
      reminder.bidRequest.status === 'RESPONDED' ||
      reminder.bidRequest.status === 'DECLINED' ||
      reminder.bidRequest.bidPackage.status !== 'PUBLISHED'
    ) {
      await prisma.bidReminder.update({
        where: { id: reminder.id },
        data: { status: 'SKIPPED' },
      });
      skipped++;
      continue;
    }

    try {
      // TODO: Send email via email service (11.3.1 Resend migration)
      logger.info(
        {
          reminderId: reminder.id,
          vendorEmail: reminder.bidRequest.vendorEmail,
          packageTitle: reminder.bidRequest.bidPackage.title,
        },
        'Bid reminder due — email send pending email service integration',
      );

      await prisma.bidReminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT', sentAt: now },
      });
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.bidReminder.update({
        where: { id: reminder.id },
        data: { status: 'FAILED', failReason: msg },
      });
      logger.error({ err, reminderId: reminder.id }, 'Bid reminder send failed');
    }
  }

  if (sent > 0 || skipped > 0) {
    logger.info({ sent, skipped, total: due.length }, 'Bid reminders processed');
  }

  return { sent, skipped, total: due.length };
}
