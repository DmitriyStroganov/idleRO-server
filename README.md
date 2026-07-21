# idleRO-server

Backend for [idleRO](https://github.com/DmitriyStroganov/idleRO): accounts, save slots, future PvP arena.

**Stack:** Fastify + TypeScript · Drizzle ORM · MySQL 8 · Zod · bcrypt · JWT
(httpOnly cookie refresh) · Docker Compose · Caddy (auto-TLS).

## Status

**Stage 11a — skeleton.** Only `/api/v1/health` is wired up. Auth + saves
routes are coming in Stage 11b/11c.

## Quick start (local dev)

```bash
cp .env.example .env
# edit JWT secrets to 32+ random chars

# Bring up MySQL
docker compose up -d mysql

# Apply migrations
npm install
npm run db:migrate

# Start dev server (tsx watch)
npm run dev
# → http://localhost:4000/api/v1/health
```

## Production deploy

```bash
cp .env.example .env
# edit secrets + CORS_ORIGIN to your PWA domain

docker compose up -d --build
docker compose exec server npm run db:migrate    # first-time only
```

On the host, install [Caddy](https://caddyserver.com/), copy
`Caddyfile.example` → `/etc/caddy/Caddyfile`, replace the domain, run
`systemctl reload caddy`. TLS is automatic.

## Environment

See `.env.example` for the full list. Key variables:

| Var | Default | Notes |
|---|---|---|
| `PORT` | 4000 | Fastify listen port |
| `CORS_ORIGIN` | http://localhost:5173 | PWA origin |
| `JWT_ACCESS_SECRET` | — | ≥32 chars, MUST change |
| `JWT_REFRESH_SECRET` | — | ≥32 chars, MUST change |
| `DB_*` | localhost/idlero | MySQL creds |
| `MYSQL_ROOT_PASSWORD` | rootpass | docker compose only |

## Project layout

```
src/
  env.ts              Zod-validated environment
  app.ts              Fastify bootstrap (cors / cookie / rate-limit)
  index.ts            Server entrypoint, signal handlers
  db/
    schema.ts         Drizzle schema (users / saves / sessions)
    client.ts         mysql2 pool + drizzle instance
    migrate.ts        `npm run db:migrate` runner
  routes/
    health.ts         GET /api/v1/health
migrations/
  *.sql               Drizzle-kit generated SQL
docker-compose.yml    mysql + server
Caddyfile.example     reverse proxy + auto-TLS
```

## Roadmap

- ✅ **11a** Skeleton: Fastify + MySQL + Drizzle + migrations + Docker
- 🚧 **11b** Auth: register / login / logout / me / refresh (bcrypt + JWT)
- 🚧 **11c** Saves API: list / get / put / delete (Zod-validated)
- 🚧 **11d** Frontend auth (LoginScreen, CharacterSelect) — in idleRO repo
- 🚧 **11e** Offline-first sync orchestrator — in idleRO repo
- 🚧 **11f** First real deploy on VPS
- 🚧 **11g** Migrate localStorage → cloud
