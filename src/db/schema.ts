/**
 * Drizzle ORM schema for MySQL.
 *
 * Architecture: server-authoritative. The server owns the simulation; the
 * client only renders state and sends commands. Therefore the DB stores
 * the AUTHORITATIVE character state, items, per-map world snapshots, plus
 * social/meta tables (profile, achievements, PvP history, audit log).
 *
 * Table overview:
 *   users                    accounts (username + bcrypt)
 *   sessions                 refresh-token tracker
 *   characters               per-user active character (stats, exp, behavior)
 *   character_map_states     per-map world snapshot (monsters, drops, tick)
 *   item_instances           every owned item as a row (enables trading/audit)
 *   user_profiles            display name, avatar, bio
 *   user_achievements        unlocked achievement IDs
 *   auth_log                 login/logout/failed-login events
 *   pvp_matches              PvP match history + replay data
 *   zeny_transactions        economy audit (every zeny delta)
 *   data_migrations          data-level migration tracker (run manually)
 *
 * __drizzle_migrations is auto-managed by drizzle-kit.
 */

import { sql } from 'drizzle-orm';
import {
  mysqlTable,
  bigint,
  varchar,
  json,
  int,
  timestamp,
  index,
  uniqueIndex,
  longtext,
  mysqlEnum,
  tinyint,
} from 'drizzle-orm/mysql-core';

// ============================================================================
// users — accounts
// ============================================================================

export const users = mysqlTable(
  'users',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    username: varchar('username', { length: 32 }).notNull(),
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
// sessions — refresh tokens (httpOnly cookie)
// ============================================================================

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),     // UUIDv4
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
// characters — active character per user
// ============================================================================

export const characters = mysqlTable(
  'characters',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    slot: varchar('slot', { length: 32 }).notNull().default('main'), // future: multi-character
    /**
     * Full Character snapshot (engine type): stats, skills, behavior,
     * appearance, equipment *references* (uids of item_instances), position.
     */
    snapshot: json('snapshot').notNull(),
    /**
     * Which map the character is currently on. Drives which
     * character_map_states row to load.
     */
    currentMapId: varchar('current_map_id', { length: 64 }).notNull(),
    /** Denormalised for leaderboard queries without JSON_EXTRACT. */
    jobId: varchar('job_id', { length: 32 }).notNull(),
    baseLevel: int('base_level').notNull().default(1),
    jobLevel: int('job_level').notNull().default(1),
    zeny: bigint('zeny', { mode: 'number' }).notNull().default(0),
    playtimeMs: bigint('playtime_ms', { mode: 'number', unsigned: true }).notNull().default(0),

    /**
     * Offline-progression tracking.
     *  - lastSeenAt: updated on every flush + on offline calc application.
     *    Used to compute (now - lastSeenAt) on reconnect → exp gain.
     *  - offlineBaselineExpPerMin / jobExpPerMin: derived from the last 5
     *    minutes of online play. If 0 (new character), a per-map estimate
     *    is used.
     *  - offlineMode: true while the player has explicitly toggled "Go Offline"
     *    from Town. Reset to false on the next connect.
     */
    lastSeenAt: timestamp('last_seen_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    offlineBaselineExpPerMin: int('offline_baseline_exp_per_min').notNull().default(0),
    offlineBaselineJobExpPerMin: int('offline_baseline_job_exp_per_min').notNull().default(0),
    offlineMode: tinyint('offline_mode', { unsigned: false }).notNull().default(0),

    createdAt: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull().onUpdateNow(),
  },
  (t) => ({
    userSlotUnique: uniqueIndex('characters_user_slot_unique').on(t.userId, t.slot),
    baseLevelIx: index('characters_base_level_ix').on(t.baseLevel),
    zenyIx: index('characters_zeny_ix').on(t.zeny),
  }),
);

// ============================================================================
// character_map_states — per-map world snapshot
// ============================================================================

export const characterMapStates = mysqlTable(
  'character_map_states',
  {
    characterId: bigint('character_id', { mode: 'number', unsigned: true }).notNull(),
    mapId: varchar('map_id', { length: 64 }).notNull(),
    /**
     * World snapshot for THIS map: tick, monsters (HP/position/aggro),
     * dropped items, etc. Compact — typically 2-10 KB.
     */
    state: json('state').notNull(),
    schemaVersion: int('schema_version').notNull().default(1),
    updatedAt: timestamp('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull().onUpdateNow(),
  },
  (t) => ({
    charMapUnique: uniqueIndex('character_map_states_char_map_unique').on(t.characterId, t.mapId),
    charIx: index('character_map_states_char_ix').on(t.characterId),
  }),
);

// ============================================================================
// item_instances — every owned item as a separate row
// ============================================================================

export const itemInstances = mysqlTable(
  'item_instances',
  {
    /** UUID — also the uid referenced by Character.equipment / inventory. */
    id: varchar('id', { length: 36 }).notNull().primaryKey(),
    ownerUserId: bigint('owner_user_id', { mode: 'number', unsigned: true }).notNull(),
    /** Static item definition id ("Item_Weapon_CompositeBow"). */
    itemId: varchar('item_id', { length: 64 }).notNull(),
    refine: int('refine').notNull().default(0),
    /** Cards socketed — array of card IDs (or null for empty slot). */
    cards: json('cards'),
    /** Where the item currently lives. */
    location: mysqlEnum('location', ['inventory', 'equipment', 'storage', 'mail', 'world'])
      .notNull()
      .default('inventory'),
    /** When location='equipment': which ArmorSlot. NULL otherwise. */
    equippedSlot: varchar('equipped_slot', { length: 32 }),
    /** Stack count for stackable items (potions, arrows, etc). */
    count: int('count').notNull().default(1),
    /** Provenance — for audit. */
    acquiredFrom: varchar('acquired_from', { length: 64 }),  // 'drop:Mob_Lunatic' / 'craft' / 'trade:USER'
    acquiredAt: timestamp('acquired_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    ownerIx: index('item_instances_owner_ix').on(t.ownerUserId),
    itemDefIx: index('item_instances_item_id_ix').on(t.itemId),
  }),
);

// ============================================================================
// user_profiles — display info
// ============================================================================

export const userProfiles = mysqlTable(
  'user_profiles',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    displayName: varchar('display_name', { length: 32 }),
    avatarKey: varchar('avatar_key', { length: 64 }),
    country: varchar('country', { length: 2 }),     // ISO-3166 alpha-2
    bio: varchar('bio', { length: 280 }),
    updatedAt: timestamp('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull().onUpdateNow(),
  },
  (t) => ({
    userPk: uniqueIndex('user_profiles_user_pk').on(t.userId),
  }),
);

// ============================================================================
// user_achievements — unlocked achievements
// ============================================================================

export const userAchievements = mysqlTable(
  'user_achievements',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    achievementId: varchar('achievement_id', { length: 64 }).notNull(),
    unlockedAt: timestamp('unlocked_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    /** Optional progress payload (e.g. '100 kills towards 1000'). */
    meta: json('meta'),
  },
  (t) => ({
    userAchPk: uniqueIndex('user_achievements_user_ach_pk').on(t.userId, t.achievementId),
    userIx: index('user_achievements_user_ix').on(t.userId),
  }),
);

// ============================================================================
// auth_log — security audit
// ============================================================================

export const authLog = mysqlTable(
  'auth_log',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }),  // NULL for failed login on unknown user
    event: mysqlEnum('event', ['register', 'login', 'logout', 'failed_login', 'password_change']).notNull(),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    /** Optional context (e.g. invalid password reason, session id). */
    meta: json('meta'),
    ts: timestamp('ts').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIx: index('auth_log_user_ix').on(t.userId),
    tsIx: index('auth_log_ts_ix').on(t.ts),
  }),
);

// ============================================================================
// pvp_matches — match history + replays
// ============================================================================

export const pvpMatches = mysqlTable(
  'pvp_matches',
  {
    id: varchar('id', { length: 36 }).notNull().primaryKey(),     // UUID
    userAId: bigint('user_a_id', { mode: 'number', unsigned: true }).notNull(),
    userBId: bigint('user_b_id', { mode: 'number', unsigned: true }).notNull(),
    /** NULL = draw or in-progress; otherwise the winning user id. */
    winnerUserId: bigint('winner_user_id', { mode: 'number', unsigned: true }),
    scoreA: int('score_a').notNull().default(0),
    scoreB: int('score_b').notNull().default(0),
    /** Seed used for the deterministic replay. */
    seed: bigint('seed', { mode: 'number', unsigned: true }).notNull(),
    /** Snapshot of both characters' behaviour configs at match time. */
    replay: longtext('replay'),                                   // gzipped JSON or null
    /** Final Elo delta applied. */
    eloDelta: int('elo_delta'),
    startedAt: timestamp('started_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    endedAt: timestamp('ended_at'),
  },
  (t) => ({
    userAIx: index('pvp_matches_user_a_ix').on(t.userAId),
    userBIx: index('pvp_matches_user_b_ix').on(t.userBId),
    startedIx: index('pvp_matches_started_ix').on(t.startedAt),
  }),
);

// ============================================================================
// user_elo — PvP rating (separate for fast leaderboard)
// ============================================================================

export const userElo = mysqlTable(
  'user_elo',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    elo: int('elo').notNull().default(1000),
    wins: int('wins').notNull().default(0),
    losses: int('losses').notNull().default(0),
    draws: int('draws').notNull().default(0),
    updatedAt: timestamp('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull().onUpdateNow(),
  },
  (t) => ({
    userPk: uniqueIndex('user_elo_user_pk').on(t.userId),
    eloIx: index('user_elo_elo_ix').on(t.elo),
  }),
);

// ============================================================================
// zeny_transactions — economy audit log
// ============================================================================

export const zenyTransactions = mysqlTable(
  'zeny_transactions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    fromUserId: bigint('from_user_id', { mode: 'number', unsigned: true }),  // NULL = system source
    toUserId: bigint('to_user_id', { mode: 'number', unsigned: true }),      // NULL = system sink
    amount: bigint('amount', { mode: 'number' }).notNull(),                   // signed; negative for reverse
    reason: varchar('reason', { length: 64 }).notNull(),                     // 'mob_kill' / 'trade' / 'npc_buy' / 'pvp_reward'
    /** Optional reference (mobId, npcId, counterparty tx). */
    meta: json('meta'),
    ts: timestamp('ts').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    fromIx: index('zeny_transactions_from_ix').on(t.fromUserId),
    toIx: index('zeny_transactions_to_ix').on(t.toUserId),
    tsIx: index('zeny_transactions_ts_ix').on(t.ts),
  }),
);

// ============================================================================
// Types
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type CharacterMapState = typeof characterMapStates.$inferSelect;
export type NewCharacterMapState = typeof characterMapStates.$inferInsert;
export type ItemInstance = typeof itemInstances.$inferSelect;
export type NewItemInstance = typeof itemInstances.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type AuthLogEntry = typeof authLog.$inferSelect;
export type PvpMatch = typeof pvpMatches.$inferSelect;
export type UserElo = typeof userElo.$inferSelect;
export type ZenyTransaction = typeof zenyTransactions.$inferSelect;

// Tinyint helper (used for boolean flags below).
void tinyint;
