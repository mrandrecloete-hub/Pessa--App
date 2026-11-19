# Deploying NEXUS NAMIBIA to a server

Stack: Caddy (automatic HTTPS) to Next.js web to NestJS API to PostgreSQL, all in Docker Compose (`deploy/docker-compose.yml`). Only ports 80 and 443 are public.

## What you need
- A Linux server (Ubuntu 22.04 or 24.04), 2 GB RAM or more, with ports 80 and 443 open. Any provider works (for example Hetzner, DigitalOcean, Contabo, a local Namibian host).
- A domain name pointing to the server (DNS A record), or use `YOUR.SERVER.IP.sslip.io` as the domain to get HTTPS before you have a domain.

## Steps
```bash
# 1. Install Docker (once)
curl -fsSL https://get.docker.com | sh

# 2. Get the code
git clone -b claude/nexus-namibia-platform-58j3uo https://github.com/mrandrecloete-hub/Pessa--App.git
cd Pessa--App/nexus/deploy

# 3. Configure secrets (never commit this file)
cp .env.example .env
nano .env        # DOMAIN, POSTGRES_PASSWORD (openssl rand -hex 24), JWT_ACCESS_SECRET (openssl rand -base64 48), optional SEED_ADMIN_*

# 4. Start. The API applies database migrations by itself on every start.
docker compose up -d --build

# 5. Load the starter records (5 hidden institution drafts + 3 DEMONSTRATION programmes; creates the admin if SEED_ADMIN_* is set)
docker compose exec api node dist/prisma/seed.js
```
Open `https://YOUR_DOMAIN`. Check: `docker compose ps` and `curl https://YOUR_DOMAIN/api/v1/health`.

## Update to a newer version
```bash
cd Pessa--App && git pull && cd nexus/deploy && docker compose up -d --build
```

## Backups (do this before real users)
```bash
# Daily dump, keep 14 days. Add to crontab: 0 2 * * * /path/to/backup.sh
docker compose -f /path/to/Pessa--App/nexus/deploy/docker-compose.yml exec -T postgres pg_dump -U nexus nexus | gzip > /backups/nexus-$(date +%F).sql.gz
find /backups -name 'nexus-*.sql.gz' -mtime +14 -delete
```
Restore (into an empty database, API stopped):
```bash
docker compose stop api web
gunzip -c /backups/nexus-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U nexus -d nexus
docker compose start api web
```
Copy backups off the server. A restore test has not been run yet: do one before launch.

## Android app
Rebuild with your address: `cd nexus/apps/android-shell && gradle assembleDebug -PserverUrl=https://YOUR_DOMAIN`.

## Status of this guide
The compose stack and Dockerfiles are written but the Docker image builds could not be completed in the development sandbox (npm network limit inside builds). The same start-up path (migrate on a fresh database, seed, production mode, login) was verified without Docker. Expect to fix small problems on the first real deploy and report them.
