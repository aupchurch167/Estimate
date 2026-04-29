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
    .string()
    .url()
    .describe('Base URL of the backend API (e.g. http://localhost:4000)'),
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

function loadEnv(): Env {
  const parsed = schema.safeParse(import.meta.env);
  if (!parsed.success) {
    const message = formatFriendlyError(parsed.error);
    // Always log; only throw in dev so prod builds fail soft.
    console.error(message);
    if (import.meta.env.DEV) {
      throw new Error(message);
    }
    return schema.parse({
      VITE_API_URL: 'http://localhost:4000',
      VITE_APP_URL: 'http://localhost:5173',
      VITE_SENTRY_DSN: '',
    });
  }
  return parsed.data;
}

export const env = loadEnv();
export type { Env };
