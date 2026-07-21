/**
 * Password hashing using bcrypt (cost factor 10).
 *
 * Cost 10 ≈ 100ms on commodity hardware in 2026 — fine for login UX.
 */

import bcrypt from 'bcryptjs';

const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
