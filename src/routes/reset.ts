/**
 * Reset endpoint — deletes character data for "test" user.
 * Also kills any active WS sessions so the character doesn't get re-saved.
 * Next WS connect will create a fresh Novice 1/1 with starter kit.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, characters, characterMapStates } from '../db/schema.js';

// Reference to kill active sessions — set by index.ts
export let killSessions: (() => void) | null = null;

export function setKillSessions(fn: () => void): void {
  killSessions = fn;
}

export async function resetRoutes(app: FastifyInstance): Promise<void> {
  app.post('/reset', async (_req, reply) => {
    // Kill active WS sessions first so they don't re-save the character.
    if (killSessions) killSessions();

    const testUser = await db.select().from(users).where(eq(users.usernameLc, 'test')).limit(1);
    if (testUser.length === 0) {
      return reply.code(404).send({ error: 'test user not found' });
    }
    const userId = testUser[0]!.id;

    // Delete character map states
    const chars = await db.select({ id: characters.id }).from(characters).where(eq(characters.userId, userId));
    for (const c of chars) {
      await db.delete(characterMapStates).where(eq(characterMapStates.characterId, c.id));
    }

    // Delete characters
    await db.delete(characters).where(eq(characters.userId, userId));

    return reply.send({ ok: true, message: 'Character reset. Reconnect to create fresh Novice 1/1.' });
  });
}
