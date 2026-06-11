import type { Request, Response } from 'express';
import { processInboundEmail } from '../services/bidInboundEmailService.js';
import { logger } from '../lib/logger.js';

export async function handleSendGridInbound(req: Request, res: Response) {
  const { from, to, subject, text, html } = req.body;

  if (!from || !to) {
    logger.warn('Inbound email webhook missing from/to');
    return res.status(200).json({ ok: true });
  }

  const result = await processInboundEmail({
    from: String(from),
    to: String(to),
    subject: String(subject ?? ''),
    text: String(text ?? ''),
    html: html ? String(html) : undefined,
  });

  return res.status(200).json(result);
}
