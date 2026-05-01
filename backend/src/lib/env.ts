/**
 * Backend environment validation.
 *
 * Loads backend/.env via dotenv, validates every variable with Zod, and
 * exits with a friendly human-readable error if anything is missing or
 * malformed. Import this module at the top of the entry point so validation
 * runs before any other code touches `process.env`.
 */

import 'dotenv/config';
import { z } from 'zod';

const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, 'must be a duration like "15m" or "7d"');

const schema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Node mode (development / production / test)'),
  PORT: z.coerce.number().int().positive().default(4000).describe('Express listen port'),
  APP_URL: z
    .string()
    .url()
    .describe('Frontend base URL (used in email links, CORS, redirects)'),
  API_URL: z.string().url().describe('API base URL (self-referencing links)'),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logger level'),

  // Database
  DATABASE_URL: z
    .string()
    .min(1)
    .describe('Postgres connection string (Neon dashboard or local Postgres)'),

  // Auth
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters')
    .describe('Random 64-char string for signing access tokens'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters')
    .describe('Random 64-char string for signing refresh tokens'),
  JWT_ACCESS_EXPIRES_IN: durationString
    .default('15m')
    .describe('Access token TTL (e.g. 15m, 1h)'),
  JWT_REFRESH_EXPIRES_IN: durationString
    .default('7d')
    .describe('Refresh token TTL (e.g. 7d)'),
  BCRYPT_ROUNDS: z.coerce
    .number()
    .int()
    .min(4)
    .max(15)
    .default(12)
    .describe('bcrypt cost factor (12 in production)'),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1).describe('Anthropic API key (sk-ant-…)'),
  AI_MODEL_PRIMARY: z.string().min(1).describe('Primary Claude model'),
  AI_MODEL_LIGHT: z.string().min(1).describe('Light Claude model for cheap runs'),
  DEFAULT_MONTHLY_AI_CAP_USD: z.coerce
    .number()
    .nonnegative()
    .default(100)
    .describe('Default per-org monthly AI cost cap (USD)'),

  // Email
  SENDGRID_API_KEY: z.string().min(1).describe('SendGrid API key (SG.…)'),
  SENDGRID_FROM_EMAIL: z.string().email().describe('Transactional email From address'),
  SENDGRID_FROM_NAME: z.string().min(1).describe('Transactional email From name'),

  // File storage (Spaces)
  SPACES_KEY: z.string().min(1).describe('DigitalOcean Spaces access key'),
  SPACES_SECRET: z.string().min(1).describe('DigitalOcean Spaces secret key'),
  SPACES_ENDPOINT: z.string().url().describe('Spaces region endpoint URL'),
  SPACES_BUCKET: z.string().min(1).describe('Spaces bucket name'),
  SPACES_REGION: z.string().min(1).describe('Spaces region code (e.g. nyc3)'),
  SIGNED_UPLOAD_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900)
    .describe('Signed upload URL TTL, in seconds'),

  // Observability
  SENTRY_DSN: z.string().url().optional().or(z.literal('')).describe('Sentry DSN (prod only)'),

  // Feature flags
  ENABLE_SIGNUP: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(true)
    .describe('Whether self-serve signup is enabled'),

  // Helm Core integration
  HELM_CORE_INTEGRATION: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(false)
    .describe('Enable Core API integration (accounts, deals, properties, vendors)'),
  CORE_API_URL: z
    .string()
    .url()
    .optional()
    .describe('Core API base URL (required when HELM_CORE_INTEGRATION=true)'),
  CORE_DEV_USER_ID: z
    .string()
    .optional()
    .describe('Real Core user UUID for dev auth bypass'),
});

type EnvSchema = typeof schema;
type Env = z.infer<EnvSchema>;

function formatFriendlyError(error: z.ZodError): string {
  const lines: string[] = ['', '[Env validation failed]', ''];
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    const description = describeKey(key);
    if (issue.code === 'invalid_type' && issue.received === 'undefined') {
      missing.push(`  - ${key} — ${description}`);
    } else {
      invalid.push(`  - ${key} — ${issue.message}${description ? ` (${description})` : ''}`);
    }
  }

  if (missing.length) {
    lines.push('Missing required env vars:');
    lines.push(...missing);
    lines.push('');
  }
  if (invalid.length) {
    lines.push('Invalid env vars:');
    lines.push(...invalid);
    lines.push('');
  }
  lines.push('Please update backend/.env and try again.');
  lines.push('');
  return lines.join('\n');
}

function describeKey(key: string): string {
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const field = shape[key];
  return field?.description ?? '';
}

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    process.stderr.write(formatFriendlyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type { Env };
