/**
 * WebSocket server.
 *
 * Attaches to the Fastify http(s) server. Authenticates the upgrade request
 * via the `?token=` query param (access JWT) — the client passes the token
 * it got from /auth/login.
 *
 * Each connection maps to one PlayerSession. Sessions share a global tick
 * scheduler (20 tps) so 1000 players = 20k ticks/sec, which is fine.
 */

import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import { loadOrCreateSession, PlayerSession } from './player-session.js';
import type { InMessage, OutMessage } from './protocol.js';

const TICK_MS = 50;
const HEARTBEAT_MS = 30_000;

export class WsServer {
  private wss: WebSocketServer;
  private sessions = new Map<WsWebSocket, PlayerSession>();
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private app: FastifyInstance) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));

    // Hijack the 'upgrade' event on the underlying http server.
    this.app.server.on('upgrade', (request, socket, head) => {
      // Only handle /ws paths.
      if (!request.url?.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tickAll(), TICK_MS);
    this.heartbeat = setInterval(() => this.heartbeatAll(), HEARTBEAT_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    // Flush all sessions before tearing down.
    await Promise.all([...this.sessions.values()].map((s) => s.flush().catch(() => {})));
    this.sessions.clear();
    this.wss.close();
  }

  /** Close all active client connections (e.g. for reset), but keep server running. */
  disconnectAll(): void {
    for (const [ws, session] of this.sessions) {
      session.suppressFlush = true;  // prevent re-save on disconnect
      try { ws.close(4000, 'session_reset'); } catch { /* ignore */ }
    }
    this.sessions.clear();
    this.app.log.info('Disconnected all WS sessions (reset)');
  }

  private async onConnection(ws: WsWebSocket, req: { url?: string }): Promise<void> {
    // Auth-less mode: auto-use "test" user (userId=1) for all connections.
    // Token is still supported if provided, but not required.
    const url = new URL(req.url ?? '/', 'http://x');
    const token = url.searchParams.get('token');

    let userId: number;
    let username: string;

    if (token) {
      try {
        const payload = verifyAccessToken(token);
        userId = payload.sub;
        username = payload.username;
      } catch {
        ws.close(4003, 'bad_token');
        return;
      }
    } else {
      // Auth-less: use auto-created "test" user (ID 1).
      userId = 1;
      username = 'test';
    }

    const send = (msg: OutMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    let session: PlayerSession;
    try {
      session = await loadOrCreateSession(userId, username, send);
    } catch (err) {
      this.app.log.error({ err }, 'failed to load session');
      ws.close(1011, 'session_load_failed');
      return;
    }
    this.sessions.set(ws, session);
    this.app.log.info({ userId, username }, 'WS connected');

    // Send initial state.
    send({ type: 'hello', user: { id: userId, username } });
    send({ type: 'state', character: session.character, world: session.world });

    // If offline-progression was applied on load, surface it silently.
    // (UI may or may not display anything — design choice is "silent".)
    const pendingOffline = (session as unknown as { pendingOfflineResult?: { applied: boolean; offlineMs: number; effectiveMs: number; expGained: number; jobExpGained: number; levelsGained: number; jobLevelsGained: number; died: boolean } }).pendingOfflineResult;
    if (pendingOffline?.applied) {
      send({ type: 'offline_applied', result: pendingOffline });
    }

    ws.on('message', async (data) => {
      let msg: InMessage;
      try {
        msg = JSON.parse(data.toString()) as InMessage;
      } catch {
        send({ type: 'error', error: 'bad_json' });
        return;
      }
      if (msg.type !== 'command' || !msg.command) {
        send({ type: 'error', error: 'bad_message' });
        return;
      }
      try {
        const signal = await session.handleCommand(msg.command);
        if (signal === PlayerSession.CLOSE_SIGNAL) {
          // Intentional offline (go_offline). The session has already flushed
          // and sent offline_mode — close the socket cleanly.
          ws.close(4000, 'intentional offline');
          return;
        }
        send({ type: 'command_ack', ok: true });
      } catch (err) {
        send({ type: 'command_ack', ok: false, error: (err as Error).message });
      }
    });

    ws.on('close', async () => {
      this.sessions.delete(ws);
      this.app.log.info({ userId }, 'WS disconnected');
      try { await session.flush(); } catch { /* best-effort */ }
    });
    ws.on('error', (err) => {
      this.app.log.warn({ err }, 'WS error');
    });
  }

  private tickAll(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      try {
        session.tick(now);
      } catch (err) {
        this.app.log.warn({ err }, 'tick error');
      }
    }
  }

  private heartbeatAll(): void {
    // Periodic flush of every session — protects against crash-during-play.
    for (const session of this.sessions.values()) {
      session.flush().catch(() => {});
    }
  }
}
