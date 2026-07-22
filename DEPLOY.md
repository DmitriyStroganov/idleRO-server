# Deploying idleRO

Production deployment guide. Covers the server-authoritative stack:
**MySQL → idleRO-server (Fastify) → nginx → browser**.

## Architecture

```
Browser  ──HTTPS──▶  nginx  ──┬─▶  /api/*  ─▶  Fastify (:4000)
                              ├─▶  /ws/*   ─▶  Fastify (:4000, WS upgrade)
                              └─▶  /       ─▶  static dist/ (PWA)
                                                  │
Fastify  ──TCP 127.0.0.1:3306──▶  MySQL 8
```

## Requirements on the host

- Linux server (Ubuntu 22.04+ tested)
- `docker` daemon installed and running
- `mysql` 8.x running on the host (bind 127.0.0.1:3306)
- `nginx` (or Caddy) as reverse proxy with TLS
- `node` 22+ for building the client (or build locally and rsync)
- Root/sudo access

## Step 1 — MySQL database

```sql
CREATE DATABASE idlero CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'idlero'@'localhost' IDENTIFIED BY 'change-this-strong-pass';
GRANT ALL ON idlero.* TO 'idlero'@'localhost';
FLUSH PRIVILEGES;
```

(If MySQL is bound to `127.0.0.1` — Ubuntu default — the docker container
will reach it via `network_mode: host`. No need to change `bind-address`.)

## Step 2 — Server deploy

```bash
# On the host:
cd /opt
git clone https://github.com/DmitriyStroganov/idleRO-server.git
cd idleRO-server

# Configure environment
cp .env.example .env
# Edit .env: set JWT secrets, DB password, CORS_ORIGIN to your domain
# e.g. CORS_ORIGIN=https://drd.kilogram.one

# Build + start (host networking so container sees host MySQL)
docker compose -f docker-compose.prod.yml up -d --build

# Apply DB migrations (creates all tables)
docker compose -f docker-compose.prod.yml exec server npm run db:migrate

# Verify
curl http://127.0.0.1:4000/api/v1/health
# expect: {"status":"ok","db":"up",...}

# Check data migrations if any are pending (none yet — safe to skip)
# docker compose -f docker-compose.prod.yml exec server npm run db:data-migrate
```

## Step 3 — Client build

Two options:

### Option A — Build on the server

```bash
# Install Node 22 (one-time)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Clone + build
cd /opt
git clone https://github.com/DmitriyStroganov/idleRO.git idleRO-client
cd idleRO-client
npm install
npm run build   # outputs to dist/

# Place under nginx root
mkdir -p /var/www/idleRO
rsync -a --delete dist/ /var/www/idleRO/
```

### Option B — Build locally, rsync

```bash
# On your dev machine:
cd ~/dev/idleRO
npm install
npm run build
rsync -avz --delete dist/ root@server:/var/www/idleRO/
```

## Step 4 — nginx config

Inside the existing `server { listen 443 ssl; server_name <your-domain>; }`
block, add (before the final `location /` if it exists):

```nginx
# idleRO API → Fastify
location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# idleRO WebSocket
location /ws/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}

# idleRO static PWA (if serving from root)
location / {
    root /var/www/idleRO;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

Apply:

```bash
nginx -t                  # syntax check
systemctl reload nginx    # zero-downtime reload
```

If `location /` is already taken by another app, mount the PWA under a
subpath instead: e.g. `location /idlero/ { alias /var/www/idleRO/; ... }`
and build the client with `VITE_BASE_PATH=/idlero/`.

## Step 5 — Smoke test

```bash
# Public endpoints
curl -sI https://your-domain/api/v1/health    # 200 ok
curl -sI https://your-domain/                  # 200, text/html
# In a browser: register a user, character should load, sprites should render
```

## Updating

```bash
# Server:
cd /opt/idleRO-server
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npm run db:migrate

# Client:
cd /opt/idleRO-client
git pull
npm install         # in case deps changed
npm run build
rsync -a --delete dist/ /var/www/idleRO/
```

## Rollback

```bash
# Server: stop the container
docker compose -f docker-compose.prod.yml down

# Database: drop the idlero DB (taptap, veil, etc. are untouched)
mysql -uroot -e "DROP DATABASE IF EXISTS idlero; DROP USER IF EXISTS 'idlero'@'localhost';"

# Client: remove the static dir
rm -rf /var/www/idleRO

# nginx: revert config backup
cp /etc/nginx/sites-enabled/<your-domain>.bak /etc/nginx/sites-enabled/<your-domain>
systemctl reload nginx
```

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:3306` from server logs** → MySQL not running,
  or the container isn't using `network_mode: host`. Re-check
  `docker-compose.prod.yml`.
- **WebSocket disconnects immediately** → nginx missing the `Upgrade` /
  `Connection` headers in the `/ws/` block.
- **Sprites don't load (blank character)** → CORS issue with ragassets;
  check the browser console for cross-origin errors. Should not happen
  because `RospriteProvider` sets `crossOrigin = 'anonymous'`.
- **Cookie not set after login** → server's `CORS_ORIGIN` doesn't match
  the page origin exactly (including scheme).
- **`offline_applied` never fires** → `last_seen_at` column missing;
  re-run migrations.
