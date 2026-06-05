import type { Request, Response } from 'express';
import { z } from 'zod';
import * as reminderService from '../services/bidReminderService.js';
import { ok, created } from '../lib/response.js';

const scheduleBody = z.object({
  bidPackageId: z.string().min(1),
  scheduledFor: z.coerce.date(),
});

export async function schedule(req: Request, res: Response) {
  const body = scheduleBody.parse(req.body);
  const reminders = await reminderService.scheduleReminders(
    body.bidPackageId,
    req.user!.organizationId,
    body.scheduledFor,
  );
  return created(res, reminders);
}

export async function listForPackage(req: Request, res: Response) {
  const reminders = await reminderService.listReminders(
    String(req.params.packageId),
    req.user!.organizationId,
  );
  return ok(res, reminders);
}

export async function cancelForPackage(req: Request, res: Response) {
  await reminderService.cancelAllForPackage(String(req.params.packageId));
  return res.status(204).end();
}

export async function processDue(_req: Request, res: Response) {
  const result = await reminderService.processDueReminders();
  return ok(res, result);
}
