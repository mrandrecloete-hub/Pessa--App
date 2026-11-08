# Architecture

- Money is `decimal.js` strings end to end, matching Postgres `numeric`. ESLint bans `parseFloat`. Amounts are rounded only at storage or display, using the currency's minor units.
- Accounting rules live in one place (`calculations/ledger.ts`): income and refund add, expense subtracts, transfers move between accounts and are never income or expense, only settled rows touch balances, savings allocations are excluded from spending.
- Each transaction stores the original amount, currency, rate, rate source and base amount, and totals use the stored base amount, so a later rate change never rewrites history.
- The UI calls the shared engine and holds no financial formulas.
- Data is local on the device in this build (zustand + AsyncStorage). The Postgres schema and RLS are ready (`supabase/migrations`) and tested, but the app does not sync to it yet.

# Security (current state)
- RLS on all user tables, composite foreign keys stop a user pointing at another user's account. Tested in `tests/db/rls.sql`, including a mutation check.
- Session tokens use `expo-secure-store` when Supabase is configured. No service-role or AI keys in the app.
- Not done: PIN, biometric lock, audit log, rate limiting, secure upload validation, encrypted backups, penetration test. The app must not be described as secure or compliant until Stage 10.
