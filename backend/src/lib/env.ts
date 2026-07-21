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

const baseSchema = z.object({
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
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .describe('Google OAuth 2.0 Web client ID — enables "Sign in with Google"'),

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
  CORE_ORG_SLUG: z
    .string()
    .optional()
    .describe('Org slug to scope Core API calls'),
  CORE_DEV_USER_ID: z
    .string()
    .optional()
    .describe('UUID of a user in Core DB — dev bypass auth (x-helm-test-user-id)'),
  CORE_SERVICE_TOKEN: z
    .string()
    .optional()
    .describe('Service-to-service bearer token for Core (required in production when HELM_CORE_INTEGRATION=true)'),

  // Helm Proof integration (vendor management + COI/insurance compliance)
  HELM_PROOF_INTEGRATION: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(false)
    .describe('Enable Proof API integration (vendor directory + COI compliance)'),
  PROOF_API_URL: z
    .string()
    .url()
    .optional()
    .describe('Proof API base URL (required when HELM_PROOF_INTEGRATION=true)'),
  PROOF_ORG_SLUG: z
    .string()
    .optional()
    .describe('Org slug or id that scopes Proof API calls (required when HELM_PROOF_INTEGRATION=true)'),
  PROOF_SERVICE_TOKEN: z
    .string()
    .optional()
    .describe('Service-to-service bearer token for Proof (required in production when HELM_PROOF_INTEGRATION=true)'),
});

const schema = baseSchema;

type EnvSchema = typeof schema;
type Env = z.infer<EnvSchema>;

// Which Core connection vars must be present for the integration to actually
// work. Auth differs by environment: production uses a service-to-service
// bearer token (CORE_SERVICE_TOKEN); development uses the Auth.js dev-bypass
// headers, which need a real Core user id (CORE_DEV_USER_ID).
function missingCoreVars(val: Env): string[] {
  const required: string[] = ['CORE_API_URL', 'CORE_ORG_SLUG'];
  required.push(val.NODE_ENV === 'production' ? 'CORE_SERVICE_TOKEN' : 'CORE_DEV_USER_ID');
  return required.filter((key) => !val[key as keyof Env]);
}

// When Core integration is on but its connection vars are incomplete, every
// Core call would throw and be silently swallowed, leaving the vendor/account
// directories mysteriously empty. We surface that loudly — but we do NOT crash
// the process. Estimating must keep working even when Core is misconfigured, so
// we disable the integration and let every consumer fall back to its local path
// (they all gate on `core.enabled()`). Returns the env with the flag corrected.
function gateCoreIntegration(val: Env): Env {
  if (!val.HELM_CORE_INTEGRATION) return val;
  const missing = missingCoreVars(val);
  if (missing.length === 0) return val;

  process.stderr.write(
    '\n[Core integration disabled]\n\n' +
      'HELM_CORE_INTEGRATION=true but required vars are missing:\n' +
      missing.map((key) => `  - ${key} — ${describeKey(key)}`).join('\n') +
      '\n\nThe server will start with Core integration OFF and fall back to ' +
      'local directories.\nSet the vars above and redeploy to enable Core.\n\n',
  );
  return { ...val, HELM_CORE_INTEGRATION: false };
}

// Proof needs a base URL and an org to scope calls to; production additionally
// needs a service token (dev uses the x-helm-test-org-slug bypass).
function missingProofVars(val: Env): string[] {
  const required: string[] = ['PROOF_API_URL', 'PROOF_ORG_SLUG'];
  if (val.NODE_ENV === 'production') required.push('PROOF_SERVICE_TOKEN');
  return required.filter((key) => !val[key as keyof Env]);
}

// Same resilient contract as Core: if Proof is enabled but misconfigured, warn
// loudly and disable it rather than crash. Consumers gate on `proof.enabled()`
// and fall back (the bid picker reverts to Core/manual vendor entry).
function gateProofIntegration(val: Env): Env {
  if (!val.HELM_PROOF_INTEGRATION) return val;
  const missing = missingProofVars(val);
  if (missing.length === 0) return val;

  process.stderr.write(
    '\n[Proof integration disabled]\n\n' +
      'HELM_PROOF_INTEGRATION=true but required vars are missing:\n' +
      missing.map((key) => `  - ${key} — ${describeKey(key)}`).join('\n') +
      '\n\nThe server will start with Proof integration OFF.\n' +
      'Set the vars above and redeploy to enable Proof.\n\n',
  );
  return { ...val, HELM_PROOF_INTEGRATION: false };
}

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
  const shape = baseSchema.shape as Record<string, z.ZodTypeAny>;
  const field = shape[key];
  return field?.description ?? '';
}

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    process.stderr.write(formatFriendlyError(parsed.error));
    process.exit(1);
  }
  return gateProofIntegration(gateCoreIntegration(parsed.data));
}

export const env = loadEnv();
export type { Env };
