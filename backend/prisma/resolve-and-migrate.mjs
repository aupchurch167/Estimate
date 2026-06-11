/**
 * Pre-start migration script.
 *
 * Uses @prisma/client to directly fix the _prisma_migrations table and
 * apply any missing Phase 11 schema changes. Non-fatal — the server
 * will start even if this script fails so Railway doesn't crash-loop.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function run() {
  const prisma = new PrismaClient();

  try {
    // 1. Fix the failed 20260318140246_init record
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "_prisma_migrations"
        SET "finished_at" = NOW(),
            "applied_steps_count" = 1,
            "rolled_back_at" = NULL,
            "logs" = 'Resolved by resolve-and-migrate script'
        WHERE "migration_name" = '20260318140246_init'
          AND "finished_at" IS NULL
      `);
      console.log('[migrate] Resolved 20260318140246_init');
    } catch (e) {
      console.log('[migrate] 20260318140246_init note:', e.message);
    }

    // 2. Mark pre-Phase-11 migrations as applied if missing from the table
    const preExisting = [
      '20260428130616_init',
      '20260429020000_add_source_input_updated_event',
      '20260429030000_comment_threading_edits',
    ];

    for (const name of preExisting) {
      try {
        const exists = await prisma.$queryRawUnsafe(
          `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 LIMIT 1`,
          name
        );
        if (exists.length === 0) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
             VALUES (gen_random_uuid(), 'resolved-by-script', $1, NOW(), 1)`,
            name
          );
          console.log(`[migrate] Marked ${name} as applied`);
        }
      } catch (e) {
        console.log(`[migrate] Skipping ${name}:`, e.message);
      }
    }

    // 3. Apply Phase 11 migrations if their tables/columns don't exist yet
    const phase11Migrations = [
      {
        name: '20260605000000_add_trade_canonical_and_mapping',
        check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'TradeCanonical' LIMIT 1`,
      },
      {
        name: '20260605010000_add_core_vendor_project_cache',
        check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'CoreVendorCache' LIMIT 1`,
      },
      {
        name: '20260605020000_add_bid_package_and_request',
        check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'BidPackage' LIMIT 1`,
      },
      {
        name: '20260605030000_add_bid_response_and_documents',
        check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'BidResponse' LIMIT 1`,
      },
      {
        name: '20260605040000_add_bid_reminder',
        check: `SELECT 1 FROM information_schema.tables WHERE table_name = 'BidReminder' LIMIT 1`,
      },
      {
        name: '20260605050000_add_bid_settings',
        check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'OrgSettings' AND column_name = 'bidDefaultDueDays' LIMIT 1`,
      },
    ];

    for (const m of phase11Migrations) {
      try {
        const rows = await prisma.$queryRawUnsafe(m.check);
        if (rows.length > 0) {
          console.log(`[migrate] ${m.name} — already applied`);
          const recorded = await prisma.$queryRawUnsafe(
            `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 LIMIT 1`,
            m.name
          );
          if (recorded.length === 0) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
               VALUES (gen_random_uuid(), 'resolved-by-script', $1, NOW(), 1)`,
              m.name
            );
          }
          continue;
        }

        const sqlPath = path.join(__dirname, 'migrations', m.name, 'migration.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        const statements = splitStatements(sql);

        for (const stmt of statements) {
          await prisma.$executeRawUnsafe(stmt);
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
           VALUES (gen_random_uuid(), 'applied-by-script', $1, NOW(), 1)`,
          m.name
        );

        console.log(`[migrate] Applied ${m.name} (${statements.length} statements)`);
      } catch (e) {
        console.error(`[migrate] FAILED ${m.name}:`, e.message);
        // Don't exit — let the server start anyway
        break;
      }
    }

    console.log('[migrate] Migration script complete.');
  } catch (e) {
    console.error('[migrate] Script error:', e.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

run().catch((e) => {
  console.error('[migrate] Uncaught error:', e.message);
  // Don't exit(1) — let the server start
});
