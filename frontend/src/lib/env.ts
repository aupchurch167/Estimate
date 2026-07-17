/**
 * Frontend environment validation.
 *
 * Validates Vite's `import.meta.env` with Zod and exports a typed `env`
 * object. Throws in development if any required `VITE_*` var is missing
 * or malformed so problems surface immediately at module load.
 */

import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z
    .union([z.string().url(), z.literal('')])
    .default('')
    .describe(
      'Base URL of the backend API (e.g. http://localhost:4000). Leave empty ' +
        'for same-origin deployments where the API is served from the same host.',
    ),
  VITE_APP_URL: z
    .string()
    .url()
    .default('http://localhost:5173')
    .describe('Public app URL'),
  VITE_SENTRY_DSN: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .describe('Sentry DSN for the browser SDK (prod only)'),
  VITE_HELM_CORE_INTEGRATION: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .optional()
    .transform((v) => v === 'true')
    .describe('Enable Core API integration (account/deal pickers on estimate form)'),
  VITE_GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .describe('Google OAuth 2.0 Web client ID — shows "Sign in with Google" when set'),
});

type Env = z.infer<typeof schema>;

function formatFriendlyError(error: z.ZodError): string {
  const lines: string[] = ['[Env validation failed]', ''];
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    const description = shape[key]?.description ?? '';
    if (issue.code === 'invalid_type' && issue.received === 'undefined') {
      lines.push(`  - ${key} — ${description}`);
    } else {
      lines.push(`  - ${key} — ${issue.message}${description ? ` (${description})` : ''}`);
    }
  }
  lines.push('');
  lines.push('Update frontend/.env (or copy frontend/.env.example) and reload.');
  return lines.join('\n');
}

const TEST_DEFAULTS = {
  VITE_API_URL: 'http://localhost:4000',
  VITE_APP_URL: 'http://localhost:5173',
  VITE_SENTRY_DSN: '',
  VITE_HELM_CORE_INTEGRATION: 'false',
};

function loadEnv(): Env {
  // In test mode (vitest), import.meta.env can be empty if the runner
  // doesn't load a .env file the way the CI server expects. Fall back
  // to localhost defaults silently — the tests don't make real network
  // calls, so the values don't matter; what matters is that the
  // module-load validation doesn't blow up the import chain.
  if (import.meta.env.MODE === 'test') {
    const merged = { ...TEST_DEFAULTS, ...import.meta.env };
    return schema.parse(merged);
  }

  const parsed = schema.safeParse(import.meta.env);
  if (!parsed.success) {
    const message = formatFriendlyError(parsed.error);
    // Always log; only throw in dev so prod builds fail soft.
    console.error(message);
    if (import.meta.env.DEV) {
      throw new Error(message);
    }
    return schema.parse(TEST_DEFAULTS);
  }
  return parsed.data;
}

export const env = loadEnv();
export type { Env };
