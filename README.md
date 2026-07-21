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

## Database versioning

The project has **two** migration tracks:

### 1. Schema migrations (DDL)

Managed by drizzle-kit. Workflow:

```bash
# 1. Edit src/db/schema.ts

# 2. Generate a SQL migration from the diff
npm run db:generate
# → migrations/0001_<auto-name>.sql

# 3. Check the generated SQL, commit it

# 4. Apply on the running database
npm run db:migrate
```

Each generated migration is a numbered `.sql` file in `migrations/`. drizzle
tracks applied ones in the `__drizzle_migrations` table (auto-created), so
running `db:migrate` repeatedly is safe — only pending files are applied.

See what's applied vs pending:

```bash
npm run db:status
```

### 2. Data migrations (DML)

For cases where you need to transform existing rows — e.g. changing the
`SaveData` JSON shape between client versions, or back-filling a column.

```bash
# Create scripts/data-migrations/2026-02-01-my-migration.ts:
#
#   import type { DataMigration } from '../data-migrate.js';
#   import { sql } from 'drizzle-orm';
#   const m: DataMigration = {
#     id: '2026-02-01-my-migration',
#     description: 'Backfill user.last_login_at',
#     async run(tx) {
#       await tx.execute(sql`UPDATE users SET last_login_at = created_at WHERE last_login_at IS NULL`);
#     },
#   };
#   export default m;

npm run db:data-migrate
```

Each migration runs inside a transaction and is tracked in the
`data_migrations` table by `id`. Re-running is safe — already-applied
migrations are skipped.

### Migration deployment

When deploying:

```bash
git pull
npm ci
npm run db:migrate          # apply schema changes
npm run db:data-migrate     # apply data transformations
# then restart the server process
```

Both runners are idempotent, so it's safe to run them on every deploy.

## Roadmap

- ✅ **11a** Skeleton: Fastify + MySQL + Drizzle + migrations + Docker
- 🚧 **11b** Auth: register / login / logout / me / refresh (bcrypt + JWT)
- 🚧 **11c** Saves API: list / get / put / delete (Zod-validated)
- 🚧 **11d** Frontend auth (LoginScreen, CharacterSelect) — in idleRO repo
- 🚧 **11e** Offline-first sync orchestrator — in idleRO repo
- 🚧 **11f** First real deploy on VPS
- 🚧 **11g** Migrate localStorage → cloud
