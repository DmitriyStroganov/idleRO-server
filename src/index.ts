/**
 * Server entry point.
 *
 * Loads env, builds Fastify, registers routes, starts listening.
 * Handles SIGTERM/SIGINT for clean shutdown.
 */

import { buildServer } from './app.js';
import { healthRoutes } from './routes/health.js';
import { closeDb } from './db/client.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildServer();

  await app.register(healthRoutes, { prefix: '/api/v1' });

  // The 0.0.0.0 host is required inside Docker so Caddy can reach us.
  await app.listen({ host: '0.0.0.0', port: env.PORT });

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
