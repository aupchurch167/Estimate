import type { Request, Response } from 'express';
import * as dashboard from '../services/dashboardService.js';
import { ForbiddenError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

export async function getDashboard(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  const data = await dashboard.loadDashboard(req.organization.id, req.user.id);
  ok(res, data);
}
