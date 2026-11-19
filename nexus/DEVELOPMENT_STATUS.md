# NEXUS NAMIBIA: development status
Updated 2026-11-19. A feature is "Completed" only when implemented AND covered by a passing test.

## Tests
`npm test`: 14 business-logic unit tests and 8 API end-to-end tests (real PostgreSQL) pass. The first journey was also run in a real browser (Playwright, manual script, not yet in CI). Web has no automated tests yet.

## Completed (implemented and tested)
- Repository inspection; NEXUS lives in `nexus/` beside the Pesa retail app (Pesa untouched except `.gitignore`).
- Brand assets cut from the supplied images (`brand/extract.py`); design tokens; web design system v1.
- Database schema and migration `init` for every table in the brief (plus `sessions`, `role_permissions`, `saved_programmes`).
- Authentication: register, login, refresh rotation, reuse detection, logout, lockout, suspension, cookie and Bearer auth.
- Backend role guard and business ownership isolation (tested).
- Business profile create, read, update with completion percentage.
- Funding Directory: search, sector, region, verification and closing filters, sort, pagination, saved opportunities; admin create, edit, verify (verification rules tested).
- Matching engine with explained met, unmet, unknown, missing documents, next actions (unit and end-to-end tested).
- Readiness assessment (6 weighted categories, persisted).
- Business plan: 16 sections, autosave with conflict detection, completion indicators, saved versions.
- Dashboard with real database figures and onboarding for empty accounts.

## Partially completed
- Business Studio: no AI assistance, evidence attachments, comments, PDF/Word export or duplicate yet.
- Funding Directory: no category filter UI, comparison view, or admin screens in the web app (admin works through the API only).
- Notifications: table only. Audit log: written, no viewer.
- Web: desktop sidebar and mobile bottom navigation exist; not yet tested on real devices, no accessibility audit.

## Outstanding (not started)
Mobile apps (Expo); password recovery, email verification, MFA; Document Vault, OCR, malware scanning; Financial Simulator (calculation engine); AI service, RAG, NEXUS AI chat; Application Centre and Rejection Recovery; Institution portal; Enterprise Monitor; National dashboard and map; Opportunity Hub; notification engine (email, push, SMS); subscriptions and billing; admin workspace; offline sync; Redis/BullMQ jobs; CI; deployment docs and backups; end-to-end browser tests.

## Known issues
- Logo master pixels come from 1536 px boards, so the emblem is 850 px and the old N icons are about 100 px. Supply the original high resolution files and re-run `python3 brand/extract.py`.
- Two logo designs were supplied. The hexagon emblem is used as logo and app icon (as instructed). The N symbol boards are kept in `brand/` only as reference.
- The wordmark in the sidebar is live text styled in the brand gold, not the lettering from the boards (too low resolution to scale).
- Rate limiting is switched off under `NODE_ENV=test` and is not itself tested.

## Required external credentials (none are configured)
AI provider key (`AI_API_KEY`), SMTP or email provider, SMS provider, push (FCM/APNs), S3 compatible object storage, production PostgreSQL and Redis, a domain with TLS.

## Required institutional permissions
Official confirmation of programme details from NYDF, DBN, Agribank, EIF and SME Fund Namibia before anything is marked VERIFIED; written agreements before any institution uses the review workflow or receives application data; no integration submits applications without user consent and an authorised channel. Legal advice on Namibian data protection and financial regulation before launch.

## Next development tasks
1. Phase 2 web admin: programme editor and verification screen; category filter and comparison.
2. Password recovery and email verification (needs an email provider).
3. Phase 3: financial calculation engine in `business-logic` with tests, then Document Vault with private storage and scanning.
4. Expo mobile app reusing the API (`X-Nexus-Client: mobile`).
5. CI pipeline running `npm test` and a Playwright journey test.
