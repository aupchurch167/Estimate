import type { Request, Response } from 'express';
import { z } from 'zod';
import * as sourceService from '../services/sourceInputService.js';
import { ConflictError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

const SOURCE_TYPES = [
  'TRANSCRIPT',
  'EMAIL',
  'SCOPE_NOTES',
  'PLAN_PDF',
  'COMPANYCAM_PROJECT',
  'MANUAL_TEXT',
  'REFERENCE_DOC',
] as const;

const createBody = z.object({
  type: z.enum(SOURCE_TYPES),
  title: z.string().min(1).max(200),
  content: z.string().nullable().optional(),
  fileUrl: z.string().url().nullable().optional(),
  fileMimeType: z.string().max(80).nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  externalRefId: z.string().max(200).nullable().optional(),
  externalRefUrl: z.string().url().nullable().optional(),
});

const signUploadBody = z.object({
  estimateId: z.string().min(1),
  contentType: z.string().min(1).max(80),
  fileSizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});

const patchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'Provide at least one of: title, content',
  });

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function actorFrom(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return {
    orgId: req.organization.id,
    actor: { id: req.user.id, role: req.user.role },
  };
}

export async function createSource(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(createBody, req.body);
  const sourceInput = await sourceService.create(
    orgId,
    actor,
    String(req.params.id ?? ''),
    input,
  );
  res.status(201).json({ sourceInput });
}

export async function patchSource(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(patchBody, req.body);
  try {
    const sourceInput = await sourceService.update(
      orgId,
      actor,
      String(req.params.id ?? ''),
      input,
    );
    ok(res, { sourceInput });
  } catch (err) {
    // ConflictError covers both the locked-status case (existing) and the
    // file_source_not_editable case (new). Render with the underlying code
    // so the UI can branch on it.
    if (err instanceof ConflictError) {
      res
        .status(err.statusCode)
        .json({
          error: { code: err.code, message: err.message, details: err.details },
        });
      return;
    }
    throw err;
  }
}

export async function deleteSource(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  await sourceService.softDelete(orgId, actor, String(req.params.id ?? ''));
  res.status(204).end();
}

export async function signSourceUpload(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(signUploadBody, req.body);
  const signed = await sourceService.signSourceUpload(orgId, actor, input);
  ok(res, signed);
}
