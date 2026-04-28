/**
 * Thin wrapper around DigitalOcean Spaces (S3-compatible).
 *
 * Exposes signed PUT URLs for direct browser uploads (avatars, logos,
 * source files) plus a helper to compute the public URL of an uploaded
 * key. The S3Client is built lazily so dev environments without real
 * Spaces credentials still boot.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

/**
 * Tests can override the storage backend with __setSpacesClientForTesting
 * (mirrors the Anthropic test hook). The real S3Client is built lazily so
 * dev environments without real Spaces credentials still boot.
 */
export interface SpacesLike {
  uploadBuffer: (input: {
    key: string;
    body: Buffer;
    contentType: string;
    acl?: 'public-read' | 'private';
  }) => Promise<void>;
  signGetUrl: (input: { key: string; expiresIn: number }) => Promise<string>;
  signPutUrl: (input: {
    key: string;
    contentType: string;
    expiresIn: number;
    acl: 'public-read' | 'private';
  }) => Promise<string>;
}

let realClient: S3Client | undefined;
let override: SpacesLike | undefined;

function s3(): S3Client {
  if (!realClient) {
    realClient = new S3Client({
      endpoint: env.SPACES_ENDPOINT,
      region: env.SPACES_REGION,
      credentials: {
        accessKeyId: env.SPACES_KEY,
        secretAccessKey: env.SPACES_SECRET,
      },
      forcePathStyle: false,
    });
  }
  return realClient;
}

const realBackend: SpacesLike = {
  async uploadBuffer({ key, body, contentType, acl }) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.SPACES_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: acl ?? 'private',
      }),
    );
  },
  async signGetUrl({ key, expiresIn }) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: env.SPACES_BUCKET, Key: key }),
      { expiresIn },
    );
  },
  async signPutUrl({ key, contentType, expiresIn, acl }) {
    return getSignedUrl(
      s3(),
      new PutObjectCommand({
        Bucket: env.SPACES_BUCKET,
        Key: key,
        ContentType: contentType,
        ACL: acl,
      }),
      { expiresIn },
    );
  },
};

function backend(): SpacesLike {
  return override ?? realBackend;
}

/** Tests only — pass undefined to restore the real backend. */
export function __setSpacesClientForTesting(fake: SpacesLike | undefined): void {
  override = fake;
}

export interface SignedUploadResult {
  url: string;
  key: string;
  expiresIn: number;
  publicUrl: string;
}

export async function generateSignedUploadUrl(opts: {
  key: string;
  contentType: string;
  expiresIn?: number;
  acl?: 'public-read' | 'private';
}): Promise<SignedUploadResult> {
  const expiresIn = opts.expiresIn ?? env.SIGNED_UPLOAD_EXPIRES_SECONDS;
  const url = await backend().signPutUrl({
    key: opts.key,
    contentType: opts.contentType,
    expiresIn,
    acl: opts.acl ?? 'public-read',
  });
  return {
    url,
    key: opts.key,
    expiresIn,
    publicUrl: publicUrlForKey(opts.key),
  };
}

/**
 * Server-side put: backend renders/holds the bytes (PDFs, generated
 * docs) and stores them in Spaces. Returns nothing — call
 * generateSignedDownloadUrl with the same key to hand a short-lived URL
 * back to the user.
 */
export async function uploadBuffer(opts: {
  key: string;
  body: Buffer;
  contentType: string;
  acl?: 'public-read' | 'private';
}): Promise<void> {
  await backend().uploadBuffer(opts);
}

export async function generateSignedDownloadUrl(opts: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const expiresIn = opts.expiresIn ?? env.SIGNED_UPLOAD_EXPIRES_SECONDS;
  return backend().signGetUrl({ key: opts.key, expiresIn });
}

export function publicUrlForKey(key: string): string {
  const endpoint = env.SPACES_ENDPOINT.replace(/\/$/, '');
  return `${endpoint}/${env.SPACES_BUCKET}/${key}`;
}
