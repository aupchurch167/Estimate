/**
 * Pre-start script: resolves any failed/missing migration records in the
 * _prisma_migrations table, then runs `prisma migrate deploy`.
 *
 * The production DB was originally bootstrapped with a migration named
 * 20260318140246_init which no longer exists in the local migrations
 * directory (it was replaced by 20260428130616_init). This script marks
 * all known pre-existing migrations as "applied" so that
 * `migrate deploy` only runs truly new migrations.
 */

import { execSync } from 'node:child_process';

const MIGRATIONS_TO_RESOLVE = [
  '20260318140246_init',
  '20260428130616_init',
  '20260429020000_add_source_input_updated_event',
  '20260429030000_comment_threading_edits',
];

for (const name of MIGRATIONS_TO_RESOLVE) {
  try {
    execSync(`npx prisma migrate resolve --applied ${name}`, {
      stdio: 'inherit',
    });
  } catch {
    // Already applied or doesn't need resolving — safe to ignore
  }
}

// Now run the actual deploy
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
