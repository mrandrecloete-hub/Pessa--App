# NEXUS NAMIBIA (this folder)
Funding intelligence platform. Separate product from Pesa retail (parent folder) and `hospitality/`: do not mix code or wording. Pesa's "no new dashboards" rule applies to the Pesa app, not here.
- Monorepo (npm workspaces): `apps/api` (NestJS 10, Prisma 5, PostgreSQL), `apps/web` (Next.js 14), `packages/business-logic` (deterministic matching, readiness, plan sections; pure TypeScript), `packages/ui` (brand tokens). Mobile (Expo) is not started.
- Run: see `README.md`. Test: `npm test` from this folder (needs PostgreSQL; the API tests use database `nexus_test`).
- Brand: the logo and app icon are the hexagon emblem (`brand/source/logo_hexagon_emblem.jpg`). Assets are pixel crops made by `python3 brand/extract.py`; never redraw them. Colours are in `packages/ui/src/tokens.ts` and `apps/web/app/globals.css`.
- Honesty rules (from the brief): never invent funding programmes, amounts, dates or eligibility; unverified programmes get no match percentage; a match percentage is never a probability of approval; demonstration data is labelled DEMONSTRATION and never mixed with verified data; NEXUS is not a lender or official body.
- Permissions are enforced in the API (`common/auth.ts` guard, `common/access.service.ts` ownership checks returning 404). Update `DEVELOPMENT_STATUS.md` with every change; do not mark a module complete until tested.
