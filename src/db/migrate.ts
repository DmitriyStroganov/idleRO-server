/**
 * Migration runner — applies SQL files under ./migrations using drizzle's
 * built-in migrator.
 *
 * Run with: `npm run db:migrate`
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, closeDb } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');

async function main(): Promise<void> {
  console.log(`▶ Applying migrations from ${MIGRATIONS_FOLDER}`);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log('✓ Migrations applied.');
  await closeDb();
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
