# Local base

MONEVA has two local layers. Neither needs a cloud account.

## 1. On-device database (done, tested)
The phone keeps all records in SQLite (`moneva.db`, app private storage), not in a JSON blob.
- Schema and migrations: `apps/android/src/db/schema.ts` (money as exact text, CHECK constraints, unique import keys, foreign keys). Add new steps at the END of `MIGRATIONS`, never edit a shipped step.
- Reads and writes: `db/repo.ts`. Batches (a statement import and its duplicate keys) are one transaction: all or nothing.
- The store (`stores/ledger.ts`) is a memory cache. Every change is written through one ordered queue. If a write fails, Home shows a warning instead of hiding it.
- First launch after updating moves the old AsyncStorage data in once, then deletes it.
- Tests: `apps/android/__tests__/db.test.ts` runs the real repository on Node's SQLite, including closing and reopening a file.
- Not done: encryption at rest (SQLCipher), backup/export, sync to Supabase. Web builds keep data in memory only.

## 2. Local backend (config written, NOT started or tested here)
A full Supabase stack on your computer: Postgres with the MONEVA schema and Row Level Security, Auth, Studio, a test mailbox and the `extract-document` function.

Needs Docker running, Node 20 or newer.
```bash
cd moneva
npm install
npm run local:start                      # first run downloads images; applies supabase/migrations and seed.sql
npm run local:env                        # Android emulator. Real phone: npm run local:env -- 192.168.1.20 (your computer's LAN IP)
cp supabase/functions/.env.example supabase/functions/.env   # add ANTHROPIC_API_KEY for photo/PDF scanning
npm run local:functions                  # serves extract-document
cd apps/android
MONEVA_LOCAL=1 npx expo run:android      # dev build; MONEVA_LOCAL allows http:// to your computer
```
Useful: Studio http://127.0.0.1:54323, test emails http://127.0.0.1:54324, `npm run local:reset` wipes and re-applies everything, `npm run local:stop`.

Safety:
- `local:env` copies only the URL and the anon key. The service-role key is never written into the app.
- `MONEVA_LOCAL=1` is the only thing that allows plain http, and the build refuses to run with it when `EAS_BUILD_PROFILE=production`.
- Local sign up needs no email confirmation (`enable_confirmations = false` in `supabase/config.toml`). Turn it on for production.

What is verified: the migration, seed and Row Level Security pass on a throwaway Postgres 16 (`npm run test:db`, no Docker needed); the config parses; `local-env.sh` was tested with simulated CLI output; the function handler is unit tested with a mocked model. What is NOT verified: `supabase start` itself, Auth against the stack, the function running in Deno, and the app signing in to it. The Supabase CLI uses Postgres 17 locally while the DB test uses 16.
