/**
 * Invitation HTTP controllers — thin shells around invitationService.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { setAuthCookies } from '../lib/cookies.js';
import * as invitationService from '../services/invitationService.js';

const createBody = z.object({
  email: z.string().email().max(254),
  role: z.enum(['OWNER', 'ADMIN', 'ESTIMATOR', 'PM', 'VIEWER']),
});

const listQuery = z.object({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});

const acceptBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request body', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function assertOrg(req: Request): string {
  if (!req.organization || !req.user) throw new ForbiddenError('Not authenticated');
  return req.organization.id;
}

export async function create(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(createBody, req.body);
  const result = await invitationService.create({
    organizationId: orgId,
    inviterId: req.user!.id,
    email: input.email,
    role: input.role,
  });
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const query = parse(listQuery, req.query);
  const data = await invitationService.list(orgId, query.status);
  ok(res, { invitations: data });
}

export async function revoke(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const id = String(req.params.id ?? '');
  await invitationService.revoke(orgId, id);
  res.status(204).end();
}

export async function getPublic(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token ?? '');
  try {
    const view = await invitationService.getPublicByToken(token);
    ok(res, view);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({
        error: { code: 'not_found', message: 'Invitation not found' },
      });
      return;
    }
    if (err instanceof ConflictError) {
      // For consumed/expired/revoked tokens we render 410 Gone with the
      // status detail so the frontend can show a precise message.
      res.status(410).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    throw err;
  }
}

export async function accept(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token ?? '');
  const input = parse(acceptBody, req.body);
  try {
    const result = await invitationService.accept({
      token,
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    setAuthCookies(res, result.tokens);
    res.status(201).json({ user: result.user, organization: result.organization });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({
        error: { code: 'not_found', message: 'Invitation not found' },
      });
      return;
    }
    if (err instanceof ConflictError && err.code.startsWith('invitation_')) {
      res.status(410).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    throw err;
  }
}
