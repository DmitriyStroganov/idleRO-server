/**
 * JWT helpers.
 *
 * Two-token model:
 *   - Access token: short TTL (15 min), returned to client in JSON body.
 *                  Client keeps in memory and sends in Authorization header.
 *   - Refresh token: opaque UUID stored in httpOnly cookie + sessions table.
 *                  Used to mint a new access token without re-login.
 */

import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface AccessTokenPayload {
  sub: number;          // user id
  username: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: { sub: number; username: string }): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

/**
 * Decode WITHOUT verifying. Used to read the user id from an expired token
 * so we can try to refresh (caller must verify the refresh token separately).
 */
export function decodeAccessToken(token: string): AccessTokenPayload | null {
  return jwt.decode(token) as AccessTokenPayload | null;
}

export const REFRESH_COOKIE_NAME = 'idlero_refresh';
export const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
