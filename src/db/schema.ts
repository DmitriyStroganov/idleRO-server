/**
 * Drizzle ORM schema for MySQL.
 *
 * Three tables:
 *   users     — username + bcrypt password hash, last-login tracking
 *   saves     — per-user save slots (slot1, slot2, slot3, autosave) with JSON data
 *   sessions  — opaque refresh tokens (uuid) stored in httpOnly cookie
 */

import { sql } from 'drizzle-orm';
import { mysqlTable, bigint, varchar, json, int, timestamp, index, uniqueIndex } from 'drizzle-orm/mysql-core';

// ============================================================================
// Users
// ============================================================================

export const users = mysqlTable(
  'users',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    username: varchar('username', { length: 32 }).notNull(),
    /**
     * Lowercased username for case-insensitive login lookups.
     * Filled by the application on insert (MySQL GENERATED columns are awkward
     * with Drizzle; we keep this simple and explicit).
     */
    usernameLc: varchar('username_lc', { length: 32 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    lastLoginAt: timestamp('last_login_at'),
  },
  (t) => ({
    usernameLcUnique: uniqueIndex('users_username_lc_unique').on(t.usernameLc),
  }),
);

// ============================================================================
// Saves
// ============================================================================

export const saves = mysqlTable(
  'saves',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    /** Slot identifier: 'slot1', 'slot2', 'slot3', 'autosave'. */
    slot: varchar('slot', { length: 32 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    /** Full SaveData JSON blob (character + world + presetId + ...). */
    data: json('data').notNull(),
    schemaVersion: int('schema_version').notNull().default(1),
    playtimeMs: bigint('playtime_ms', { mode: 'number', unsigned: true }).notNull().default(0),
    updatedAt: timestamp('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull()
      .onUpdateNow(),
  },
  (t) => ({
    userSlotUnique: uniqueIndex('saves_user_slot_unique').on(t.userId, t.slot),
    userIx: index('saves_user_ix').on(t.userId),
  }),
);

// ============================================================================
// Sessions (refresh tokens)
// ============================================================================

export const sessions = mysqlTable(
  'sessions',
  {
    /** UUIDv4 — opaque token, stored in httpOnly cookie. */
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    ip: varchar('ip', { length: 45 }),
    createdAt: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIx: index('sessions_user_ix').on(t.userId),
    expiresIx: index('sessions_expires_ix').on(t.expiresAt),
  }),
);

// ============================================================================
// Types
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
