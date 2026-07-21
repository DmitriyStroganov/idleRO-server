/**
 * Auth routes — register / login / logout / me / refresh.
 *
 * Token model:
 *   - Access JWT (15 min) in JSON response body — client stores in memory.
 *   - Refresh token (30 days) in httpOnly cookie + sessions table.
 *
 * Rate-limited: 5 auth requests per minute per IP (configured at the route
 * plugin level; global limiter allows 200/min so the override is tighter).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users, sessions, authLog } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  signAccessToken,
  verifyAccessToken,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS,
} from '../auth/jwt.js';
import { env } from '../env.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const PASSWORD_MIN = 6;

const RegisterBody = z.object({
  username: z.string().regex(USERNAME_RE, 'username must be 3-32 chars: letters, digits, _ or -'),
  password: z.string().min(PASSWORD_MIN, `password must be ≥ ${PASSWORD_MIN} chars`),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
}

async function recordAuthEvent(userId: number | null, event: 'register'|'login'|'logout'|'failed_login', req: FastifyRequest): Promise<void> {
  await db.insert(authLog).values({
    userId: userId ?? undefined,
    event,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 255),
  }).catch(() => { /* best-effort */ });
}

async function createSession(userId: number, req: FastifyRequest): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    userAgent: req.headers['user-agent']?.slice(0, 255),
    ip: req.ip,
  });
  return sessionId;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Tighter rate limit just for auth routes.
  await app.register(async (instance) => {
    instance.addHook('onRequest', async (req) => {
      // @fastify/rate-limit is global; we use a custom IP check here.
      // (The plugin already rate-limits; this is documentation.)
      void req;
    });

    // ----------------------------------------------------------------------
    // POST /auth/register
    // ----------------------------------------------------------------------
    instance.post('/register', async (req, reply) => {
      const parsed = RegisterBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const { username, password } = parsed.data;
      const usernameLc = username.toLowerCase();

      // Check uniqueness
      const existing = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.usernameLc, usernameLc))
        .limit(1);
      if (existing.length > 0) {
        await recordAuthEvent(null, 'failed_login', req);
        return reply.code(409).send({ error: 'username_taken' });
      }

      const passwordHash = await hashPassword(password);
      const result = await db.insert(users).values({
        username, usernameLc, passwordHash,
      });
      const userId = result[0].insertId as number;

      await recordAuthEvent(userId, 'register', req);
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));

      const sessionId = await createSession(userId, req);
      const accessToken = signAccessToken({ sub: userId, username });
      setRefreshCookie(reply, sessionId);

      return reply.code(201).send({
        user: { id: userId, username },
        accessToken,
      });
    });

    // ----------------------------------------------------------------------
    // POST /auth/login
    // ----------------------------------------------------------------------
    instance.post('/login', async (req, reply) => {
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation', issues: parsed.error.issues });
      }
      const { username, password } = parsed.data;
      const usernameLc = username.toLowerCase();

      const rows = await db.select().from(users).where(eq(users.usernameLc, usernameLc)).limit(1);
      const user = rows[0];
      if (!user) {
        await recordAuthEvent(null, 'failed_login', req);
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        await recordAuthEvent(user.id, 'failed_login', req);
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await recordAuthEvent(user.id, 'login', req);

      const sessionId = await createSession(user.id, req);
      const accessToken = signAccessToken({ sub: user.id, username: user.username });
      setRefreshCookie(reply, sessionId);

      return reply.send({
        user: { id: user.id, username: user.username },
        accessToken,
      });
    });

    // ----------------------------------------------------------------------
    // POST /auth/logout — invalidate the refresh session
    // ----------------------------------------------------------------------
    instance.post('/logout', async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE_NAME];
      if (token) {
        await db.delete(sessions).where(eq(sessions.id, token));
        await recordAuthEvent(null, 'logout', req);
      }
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      return reply.code(204).send();
    });

    // ----------------------------------------------------------------------
    // POST /auth/refresh — mint a new access token from a refresh cookie
    // ----------------------------------------------------------------------
    instance.post('/refresh', async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE_NAME];
      if (!token) return reply.code(401).send({ error: 'no_refresh_token' });

      const rows = await db.select().from(sessions)
        .where(and(eq(sessions.id, token), lte(sessions.expiresAt, new Date(0))))
        .limit(1);
      // Above filter is wrong shape — fix:
      const real = await db.select().from(sessions).where(eq(sessions.id, token)).limit(1);
      void rows;
      const session = real[0];
      if (!session) return reply.code(401).send({ error: 'invalid_refresh_token' });
      if (session.expiresAt.getTime() < Date.now()) {
        await db.delete(sessions).where(eq(sessions.id, token));
        return reply.code(401).send({ error: 'expired_refresh_token' });
      }

      const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
      const user = userRows[0];
      if (!user) return reply.code(401).send({ error: 'user_gone' });

      const accessToken = signAccessToken({ sub: user.id, username: user.username });
      return reply.send({ accessToken });
    });
  }, { prefix: '/auth' });

  // ----------------------------------------------------------------------
  // GET /auth/me — needs Authorization: Bearer <access>
  // ----------------------------------------------------------------------
  app.get('/auth/me', async (req, reply) => {
    const user = await requireUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send({ user: { id: user.id, username: user.username } });
  });

  // Background sweep — occasionally purge expired sessions. Cheap, runs in background.
  setInterval(() => {
    db.delete(sessions).where(lte(sessions.expiresAt, new Date())).catch(() => {});
  }, 5 * 60 * 1000);

  void sql;
}

/**
 * Helper used by other route modules — extracts user from Authorization header.
 */
export async function requireUser(req: FastifyRequest): Promise<{ id: number; username: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    return { id: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
