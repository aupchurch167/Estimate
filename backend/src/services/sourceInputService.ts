/**
 * Source input service.
 *
 * MVP scope: text-based sources (TRANSCRIPT / EMAIL / SCOPE_NOTES /
 * MANUAL_TEXT). File-based types (PLAN_PDF / REFERENCE_DOC /
 * COMPANYCAM_PROJECT) accept records via the same create() API; the
 * actual file upload uses signSourceUpload() to mint a presigned PUT to
 * Spaces and the client pushes the bytes directly. PDF/photo intake is
 * a P1 surface; we only stub the signed URL here.
 */

import { randomBytes } from 'node:crypto';
import type { SourceInput, SourceInputType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import { generateSignedUploadUrl, type SignedUploadResult } from '../lib/spaces.js';

const LOCKED_STATUSES = new Set(['SENT', 'WON', 'LOST']);
const MAX_TEXT_BYTES = 200 * 1024; // 200KB
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_FILE_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface Actor {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';
}

async function loadEstimate(organizationId: string, estimateId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  return estimate;
}

function assertCanModifySources(
  actor: Actor,
  estimate: { drafterId: string; status: string },
): void {
  // Drafter or any admin can add/remove sources. Reviewers + PMs + viewers
  // cannot per playbook 2.13. Status SENT/WON/LOST blocks everyone.
  const isAdmin = actor.role === 'OWNER' || actor.role === 'ADMIN';
  const isDrafter = actor.id === estimate.drafterId;
  if (!isAdmin && !isDrafter) {
    throw new ForbiddenError('Only the drafter or an admin can manage sources');
  }
  if (LOCKED_STATUSES.has(estimate.status)) {
    throw new ConflictError(
      `Cannot modify sources while estimate is ${estimate.status}`,
      'cannot_edit_in_current_status',
      { status: estimate.status },
    );
  }
}

const TEXT_TYPES: SourceInputType[] = ['TRANSCRIPT', 'EMAIL', 'SCOPE_NOTES', 'MANUAL_TEXT'];
const FILE_TYPES: SourceInputType[] = ['PLAN_PDF', 'REFERENCE_DOC'];

// ─── Create ──────────────────────────────────────────────────────────────

export interface CreateSourceInput {
  type: SourceInputType;
  title: string;
  content?: string | null;
  fileUrl?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  externalRefId?: string | null;
  externalRefUrl?: string | null;
}

export async function create(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  input: CreateSourceInput,
): Promise<SourceInput> {
  const estimate = await loadEstimate(organizationId, estimateId);
  assertCanModifySources(actor, estimate);

  if (TEXT_TYPES.includes(input.type)) {
    if (!input.content || input.content.trim().length === 0) {
      throw new ValidationError('Text sources require a non-empty content body', {
        field: 'content',
      });
    }
    if (Buffer.byteLength(input.content, 'utf8') > MAX_TEXT_BYTES) {
      throw new ValidationError('Source content exceeds 200KB', {
        field: 'content',
        maxBytes: MAX_TEXT_BYTES,
      });
    }
    if (input.fileUrl) {
      throw new ValidationError('Text sources cannot have a fileUrl', { field: 'fileUrl' });
    }
  } else if (FILE_TYPES.includes(input.type)) {
    if (!input.fileUrl) {
      throw new ValidationError('File sources require a fileUrl', { field: 'fileUrl' });
    }
    if (input.content) {
      throw new ValidationError('File sources cannot have inline content', {
        field: 'content',
      });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.sourceInput.create({
      data: {
        organizationId,
        estimateId,
        type: input.type,
        title: input.title.trim(),
        content: input.content?.trim() ?? null,
        fileUrl: input.fileUrl ?? null,
        fileMimeType: input.fileMimeType ?? null,
        fileSizeBytes: input.fileSizeBytes ?? null,
        externalRefId: input.externalRefId ?? null,
        externalRefUrl: input.externalRefUrl ?? null,
        addedById: actor.id,
      },
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'SOURCE_INPUT_ADDED',
        entityType: 'SourceInput',
        entityId: row.id,
        estimateId,
        summary: `Added ${row.type.toLowerCase().replace(/_/g, ' ')} "${row.title}"`,
      },
    });
    return row;
  });
  return created;
}

// ─── Update ───────────────────────────────────────────────────────────────

export interface UpdateSourceInput {
  title?: string;
  content?: string | null;
}

/**
 * Edit an existing source input. Permitted fields are title + content
 * only — everything else (type, fileUrl, externalRef, addedById) is
 * immutable post-creation. File-based sources are not editable: the
 * intent is "fix a typo / trim a transcript", not "swap the content
 * out from under any past AI run that already used it".
 *
 * Past AIRun.inputs is NOT retroactively modified — runs are
 * historical. The next GENERATE_LINE_ITEMS / ASK_FOLLOWUP run will
 * see the edited content; older runs continue to reflect what was
 * actually sent to Anthropic at the time.
 */
export async function update(
  organizationId: string,
  actor: Actor,
  id: string,
  patch: UpdateSourceInput,
): Promise<SourceInput> {
  const source = await prisma.sourceInput.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!source) throw new NotFoundError('SourceInput', id);
  const estimate = await loadEstimate(organizationId, source.estimateId);
  assertCanModifySources(actor, estimate);

  if (source.fileUrl) {
    throw new ConflictError(
      'File-based sources are not editable. Delete and re-upload to replace.',
      'file_source_not_editable',
      { sourceInputId: id },
    );
  }

  const data: { title?: string; content?: string | null } = {};
  const fieldsChanged: string[] = [];

  if (patch.title !== undefined) {
    const next = patch.title.trim();
    if (next.length === 0) {
      throw new ValidationError('Source title cannot be empty', { field: 'title' });
    }
    if (next.length > 200) {
      throw new ValidationError('Source title is too long (max 200 chars)', {
        field: 'title',
      });
    }
    if (next !== source.title) {
      data.title = next;
      fieldsChanged.push('title');
    }
  }

  if (patch.content !== undefined) {
    if (patch.content === null || patch.content.trim().length === 0) {
      throw new ValidationError('Text sources require non-empty content', {
        field: 'content',
      });
    }
    if (Buffer.byteLength(patch.content, 'utf8') > MAX_TEXT_BYTES) {
      throw new ValidationError('Source content exceeds 200KB', {
        field: 'content',
        maxBytes: MAX_TEXT_BYTES,
      });
    }
    const next = patch.content.trim();
    if (next !== (source.content ?? '')) {
      data.content = next;
      fieldsChanged.push('content');
    }
  }

  if (fieldsChanged.length === 0) {
    // No-op patches return the unchanged row without writing an
    // activity event. Saves a useless audit-log entry on
    // re-submitting the same form.
    return source;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.sourceInput.update({
      where: { id },
      data,
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'SOURCE_INPUT_UPDATED',
        entityType: 'SourceInput',
        entityId: id,
        estimateId: source.estimateId,
        summary: `Updated source "${next.title}"`,
        meta: { sourceInputId: id, fieldsChanged },
      },
    });
    return next;
  });
  return updated;
}

// ─── Soft delete ─────────────────────────────────────────────────────────

export async function softDelete(
  organizationId: string,
  actor: Actor,
  id: string,
): Promise<void> {
  const source = await prisma.sourceInput.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!source) throw new NotFoundError('SourceInput', id);
  const estimate = await loadEstimate(organizationId, source.estimateId);
  assertCanModifySources(actor, estimate);

  await prisma.$transaction(async (tx) => {
    await tx.sourceInput.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'SOURCE_INPUT_REMOVED',
        entityType: 'SourceInput',
        entityId: id,
        estimateId: source.estimateId,
        summary: `Removed source "${source.title}"`,
      },
    });
  });
}

// ─── Signed upload (P1 file types) ────────────────────────────────────────

export interface SignSourceUploadInput {
  contentType: string;
  fileSizeBytes: number;
  estimateId: string;
}

export async function signSourceUpload(
  organizationId: string,
  actor: Actor,
  input: SignSourceUploadInput,
): Promise<SignedUploadResult> {
  const estimate = await loadEstimate(organizationId, input.estimateId);
  assertCanModifySources(actor, estimate);

  if (!ALLOWED_FILE_MIMES.has(input.contentType)) {
    throw new ValidationError('Unsupported source file type', {
      allowed: Array.from(ALLOWED_FILE_MIMES),
      received: input.contentType,
    });
  }
  if (input.fileSizeBytes <= 0 || input.fileSizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError('Source file exceeds maximum size', {
      maxBytes: MAX_FILE_BYTES,
      received: input.fileSizeBytes,
    });
  }
  const ext = mimeToExt(input.contentType);
  const slug = randomBytes(6).toString('hex');
  const key = `orgs/${organizationId}/estimates/${input.estimateId}/sources/${Date.now()}-${slug}.${ext}`;
  return generateSignedUploadUrl({ key, contentType: input.contentType, acl: 'private' });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export const INTERNAL = { TEXT_TYPES, FILE_TYPES, MAX_TEXT_BYTES, MAX_FILE_BYTES };
