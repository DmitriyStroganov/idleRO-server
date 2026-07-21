/**
 * MySQL connection pool (mysql2/promise) wrapped by Drizzle.
 *
 * Singleton — `db` exports the only instance.
 */

import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // JSON columns returned as objects already.
  namedPlaceholders: false,
});

export const db = drizzle(pool, { schema, mode: 'default' });

/** Close the pool — call on shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
