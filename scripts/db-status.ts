/**
 * db:status — print applied vs pending migrations.
 *
 * Usage: `npm run db:status`
 *
 * Reads the migrations/ folder for available files and the live
 * `__drizzle_migrations` table (if it exists) for applied ones.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

interface AppliedRow {
  hash: string;
  created_at: number;
}

async function main(): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let applied: AppliedRow[] = [];
  let tableExists = true;
  try {
    const [rows] = await db.execute(sql`
      SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at
    `);
    applied = Array.isArray(rows) ? (rows as AppliedRow[]) : [];
  } catch (err: unknown) {
    // mysql2 returns ER_NO_SUCH_TABLE when the migrations table doesn't exist yet
    const code = (err as { code?: string }).code;
    if (code === 'ER_NO_SUCH_TABLE') {
      tableExists = false;
    } else {
      throw err;
    }
  }

  console.log('\nidleRO-server migrations');
  console.log('='.repeat(60));

  if (!tableExists) {
    console.log('⚠️  __drizzle_migrations table does not exist yet.');
    console.log('   Run `npm run db:migrate` to create it and apply all pending migrations.\n');
    for (const f of files) console.log(`   [PENDING]  ${f}`);
    console.log();
    await closeDb();
    return;
  }

  console.log(`Applied: ${applied.length}   Files on disk: ${files.length}\n`);

  // drizzle records one row per migration file in order; show them paired.
  const appliedCount = applied.length;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (i < appliedCount) {
      console.log(`   [APPLIED]  ${file}`);
    } else {
      console.log(`   [PENDING]  ${file}`);
    }
  }
  console.log('');
  await closeDb();
}

main().catch((err) => {
  console.error('✗ db:status failed:', err);
  process.exit(1);
});
