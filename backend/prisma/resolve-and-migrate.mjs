/* global console */
/**
 * Pre-start migration script.
 *
 * Resolves the failed 20260318140246_init migration record, marks
 * pre-existing migrations as applied, then runs prisma migrate deploy.
 * Non-fatal — the server starts regardless.
 *
 * Has a 30-second timeout so it can't hang and block startup.
 */

import { execSync } from 'node:child_process';

const TIMEOUT = 30_000;

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit', timeout: TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

// Resolve the failed init migration
run('prisma migrate resolve --applied 20260318140246_init');

// Mark pre-existing migrations as applied (in case the DB only has the old init)
run('prisma migrate resolve --applied 20260428130616_init');
run('prisma migrate resolve --applied 20260429020000_add_source_input_updated_event');
run('prisma migrate resolve --applied 20260429030000_comment_threading_edits');

// Deploy new migrations
run('prisma migrate deploy');

console.log('[migrate] Done.');
