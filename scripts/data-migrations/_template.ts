/**
 * Example data migration — backfill `users.last_login_at` for accounts
 * created before the column existed (not actually needed for idleRO,
 * kept as a reference template for real data migrations).
 *
 * Copy this file, rename it, change `id` and `run`, ship it.
 */

import type { DataMigration } from '../data-migrate.js';

const migration: DataMigration = {
  id: '2026-01-01-template-example',
  description: 'Example data migration — see file for template usage',
  async run(_tx) {
    // Example: backfill last_login_at to created_at when NULL.
    // await _tx.execute(sql`UPDATE users SET last_login_at = created_at WHERE last_login_at IS NULL`);
  },
};

export default migration;
