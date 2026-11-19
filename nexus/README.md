# NEXUS NAMIBIA
Empowering Enterprise. Connecting Capital. Building Namibia.

## Run locally
Requirements: Node 20+, PostgreSQL 16 (or `docker compose up -d`).
```bash
cd nexus
npm install
cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL and a long random JWT_ACCESS_SECRET
npm run build:logic
npm run db:migrate                           # applies prisma migrations
npm run build -w @nexus/api && npm run db:seed   # 5 draft institution records + 3 DEMONSTRATION programmes
npm run dev:api                              # http://localhost:4000  (Swagger at /api/docs outside production)
npm run build -w @nexus/web && npm run start -w @nexus/web   # http://localhost:3000
```
Optional administrator: set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (12+ characters) before `db:seed`.
The web app proxies `/api/v1/*` to the API (`API_URL`, default `http://127.0.0.1:4000`) so cookies stay same origin.

## Tests
`npm test` runs the business-logic unit tests and the API end-to-end tests against the PostgreSQL database `nexus_test` (override with `TEST_DATABASE_URL`; the tests TRUNCATE every table in it, never point it at real data).

## Layout
`apps/api` API, `apps/web` web, `packages/business-logic` matching/readiness/plan logic, `packages/ui` brand tokens, `brand/` source boards and extraction script, `docs/` architecture and security notes, `infrastructure/deployment` (to be filled in Phase 9).
