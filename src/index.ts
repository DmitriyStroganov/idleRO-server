/**
 * Server entry point.
 *
 * Loads env, builds Fastify, registers routes + WebSocket server,
 * starts the sim tick loop. Handles SIGTERM/SIGINT for clean shutdown.
 *
 * Auth-less prototype mode: auto-creates "test" user on startup.
 */

import { buildServer } from './app.js';
import { healthRoutes } from './routes/health.js';
import { resetRoutes, setKillSessions } from './routes/reset.js';
import { WsServer } from './ws/server.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from './env.js';

/** Auto-seed a "test" user (ID=1) if it doesn't exist. */
async function seedTestUser(): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.usernameLc, 'test')).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({
      username: 'test',
      usernameLc: 'test',
      passwordHash: '$2a$10$placeholder', // auth-less mode, never checked
    });
    console.log('✓ Seeded "test" user (ID=1)');
  }
}

async function main(): Promise<void> {
  const app = await buildServer();

  // Seed test user before starting.
  await seedTestUser();

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(resetRoutes, { prefix: '/api/v1' });

  // WebSocket server (auth-less: accepts connections without token).
  const ws = new WsServer(app);
  ws.start();
  app.addHook('onClose', async () => { await ws.stop(); });

  // Allow reset endpoint to disconnect active WS sessions (without killing server).
  setKillSessions(() => ws.disconnectAll());

  await app.listen({ host: '0.0.0.0', port: env.PORT });
  console.log(`WebSocket: ws://0.0.0.0:${env.PORT}/ws (auth-less mode)`);
  console.log(`Reset: POST http://0.0.0.0:${env.PORT}/api/v1/reset`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
