# MONEVA: Take Control. Build Wealth.

Android-first personal finance app (Expo SDK 58, React Native, TypeScript strict, Supabase). This folder is independent of the Pesa web app in the repository root.

## Status
Stage 1 (foundation) is done and verified. Stage 3 pieces needed for scanning (local ledger, import) were pulled forward. See [docs/roadmap.md](docs/roadmap.md) for exactly what works and what does not.

## Run it
```bash
cd moneva
npm install
npm test                 # shared engine: money, ledger, budget, scanners (vitest)
npm run test:app         # app store + insight tests (jest-expo)
npm run typecheck
npm run lint
tests/db/run.sh          # migration + Row Level Security tests on a throwaway Postgres 16 (needs local postgres)
cd apps/android && npx expo start --android   # needs Android Studio emulator or a phone with Expo Go / dev build
```
Supabase is optional for now: copy `.env.example` to `apps/android/.env` and fill the two public values. Apply `supabase/migrations/*.sql` then `supabase/seed.sql` with the Supabase CLI.

## Layout
- `apps/android` Expo app (screens in `src/app`, UI in `src/components`, state in `src/stores`, no money maths in UI files)
- `packages/shared` pure TypeScript engine: `money`, `calculations`, `scanning`, `schemas`
- `supabase` migrations and seed, `tests/db` RLS tests, `docs`
