# Architecture (Phase 1 state)
- Browser to Next.js (same origin) to `/api/v1/*` rewrite to NestJS to PostgreSQL via Prisma. Redis/BullMQ are planned for notifications and document scanning, not wired yet.
- Auth: scrypt password hashes; 15 minute HS256 access JWT plus rotating opaque refresh token stored hashed in `sessions`; reuse of a rotated token revokes all of the user's sessions. Web uses httpOnly SameSite=Strict cookies; mobile sends `X-Nexus-Client: mobile` and receives tokens in the body for secure storage. Roles and suspension are read from the database on every request.
- Authorisation: global `AuthGuard` (everything private by default, `@Public()` opt out), `@Roles()` for role routes, `AccessService` ownership checks (another user's record is a 404).
- Money is NAD, stored as `Decimal(14,2)`.
- Matching and readiness are deterministic functions in `packages/business-logic`; the API persists snapshots (`eligibility_assessments`, `readiness_assessments`). AI is not involved in any score.
- Business plans are JSON sections with an integer `version`; saves use compare-and-set on `baseVersion` and return 409 on a stale edit (the basis for offline sync conflict handling later).
- Programme integrity: editing a verified programme resets it to UNVERIFIED; verification needs an official website, a source note and recorded criteria; DEMONSTRATION records can never be verified.
