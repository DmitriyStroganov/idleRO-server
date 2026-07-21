/**
 * Data migrations runner.
 *
 * Schema migrations (DDL) are handled by drizzle-kit + `npm run db:migrate`.
 * Data migrations are for cases where we need to transform existing rows —
 * e.g. changing the SaveData JSON shape between schema versions, back-filling
 * a column, or fixing bad data after a bug.
 *
 * Each data migration is a TypeScript file in `scripts/data-migrations/`
 * exporting `{ id, description, run(db) }`. The runner tracks applied IDs
 * in the `data_migrations` table (created lazily on first run).
 *
 * Usage: `npm run db:data-migrate`
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_MIGRATIONS_DIR = join(__dirname, 'data-migrations');

/**
 * Transaction type passed to each migration. Matches the tx parameter of
 * db.transaction(). Using `typeof db` keeps things loose while still being
 * typed enough for `tx.execute(sql\`...\`)`.
 */
type DbLike = typeof db;

export interface DataMigration {
  /** Unique slug, e.g. '2026-01-15-fix-lunatic-hp'. */
  id: string;
  description: string;
  /** Run inside the transaction the caller opens. Must be idempotent. */
  run: (tx: DbLike) => Promise<void>;
}

async function main(): Promise<void> {
  // Ensure tracker table exists.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS data_migrations (
      id VARCHAR(64) PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);

  const [rows] = await db.execute(sql`SELECT id FROM data_migrations`);
  const applied = new Set((Array.isArray(rows) ? rows : []).map((r: { id: string }) => r.id));

  // Dynamic-import every .ts file in the data-migrations folder.
  const files = (await readdir(DATA_MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.startsWith('_'))
    .sort();

  if (files.length === 0) {
    console.log('ℹ  No data migrations to apply.');
    await closeDb();
    return;
  }

  let count = 0;
  for (const file of files) {
    const path = join(DATA_MIGRATIONS_DIR, file);
    const mod = await import(`file://${path}`);
    const migration: DataMigration | undefined = mod.default;
    if (!migration?.id) {
      console.warn(`⚠  ${file} has no default export with id — skipping`);
      continue;
    }
    if (applied.has(migration.id)) {
      console.log(`   [APPLIED]  ${migration.id} — ${migration.description}`);
      continue;
    }
    console.log(`   [RUNNING]  ${migration.id} — ${migration.description}`);
    await db.transaction(async (tx) => {
      await migration.run(tx as unknown as DbLike);
      await tx.execute(sql`INSERT INTO data_migrations (id, description) VALUES (${migration.id}, ${migration.description})`);
    });
    count++;
  }

  console.log(`✓ Applied ${count} data migration(s).`);
  await closeDb();
}

main().catch((err) => {
  console.error('✗ Data migration failed:', err);
  process.exit(1);
});
