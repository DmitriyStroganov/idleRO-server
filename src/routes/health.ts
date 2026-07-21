/**
 * Health-check route.
 *
 * Used by Docker / Caddy health checks and as a "is the server up?" probe
 * from the PWA.
 */

import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    let dbOk = true;
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbOk = false;
    }
    const ok = dbOk;
    reply.code(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      db: dbOk ? 'up' : 'down',
      ts: new Date().toISOString(),
    });
  });
}
