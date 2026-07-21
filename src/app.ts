/**
 * Fastify bootstrap.
 *
 * Wires up:
 *   - Pino logger (level via LOG_LEVEL)
 *   - CORS (origin via CORS_ORIGIN — the idleRO PWA host)
 *   - Cookies (httpOnly refresh-token storage)
 *   - Rate limiting (per-IP, hooks into /auth/* with a tighter limit)
 *
 * Route modules register themselves against the returned app instance.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true, // needed when behind Caddy / nginx
  });

  // CORS — the idleRO PWA origin.
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true, // allow refresh-token cookie
  });

  // Cookies — httpOnly storage for refresh tokens.
  await app.register(cookie, {
    secret: env.JWT_REFRESH_SECRET,
  });

  // Global rate-limit. Tighter override for auth endpoints in their plugins.
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    hook: 'onRequest',
    keyGenerator: (req) => req.ip,
  });

  return app;
}
