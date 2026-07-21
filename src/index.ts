/**
 * Server entry point.
 *
 * Loads env, builds Fastify, registers REST routes + WebSocket server,
 * starts the sim tick loop. Handles SIGTERM/SIGINT for clean shutdown.
 */

import { buildServer } from './app.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { WsServer } from './ws/server.js';
import { closeDb } from './db/client.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildServer();

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });

  // WebSocket server (handles /ws/* paths via 'upgrade' hijack).
  const ws = new WsServer(app);
  ws.start();
  app.addHook('onClose', async () => { await ws.stop(); });

  await app.listen({ host: '0.0.0.0', port: env.PORT });
  app.log.info(`WebSocket: ws://0.0.0.0:${env.PORT}/ws?token=<access_jwt>`);

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
