/**
 * Thin wrapper around DigitalOcean Spaces (S3-compatible).
 *
 * Exposes signed PUT URLs for direct browser uploads (avatars, logos,
 * source files) plus a helper to compute the public URL of an uploaded
 * key. The S3Client is built lazily so dev environments without real
 * Spaces credentials still boot.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: env.SPACES_ENDPOINT,
      region: env.SPACES_REGION,
      credentials: {
        accessKeyId: env.SPACES_KEY,
        secretAccessKey: env.SPACES_SECRET,
      },
      forcePathStyle: false,
    });
  }
  return client;
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
  const command = new PutObjectCommand({
    Bucket: env.SPACES_BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
    ACL: opts.acl ?? 'public-read',
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn });
  return {
    url,
    key: opts.key,
    expiresIn,
    publicUrl: publicUrlForKey(opts.key),
  };
}

export function publicUrlForKey(key: string): string {
  const endpoint = env.SPACES_ENDPOINT.replace(/\/$/, '');
  return `${endpoint}/${env.SPACES_BUCKET}/${key}`;
}
