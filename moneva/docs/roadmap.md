# Roadmap and honest status

| Stage | Scope | Status |
|---|---|---|
| 1 Foundation | Expo shell, routing, tokens, logo, Supabase client, lint/test setup | Done. Android bundle compiles; UI checked in a headless browser. Not run on a real Android device yet. |
| 2 Auth and onboarding | Sign up, login, recovery, profile, currency, accounts | Not started. Supabase client exists but no auth screens. |
| 3 Accounts and transactions | Local ledger, add income/expense, history, search, delete | Partly done: single account, base currency only, stored on the device (AsyncStorage). No edit screen, no transfers screen, no cloud sync yet. |
| 4 Budgeting | Suggested split 50/30/20 and 60/20/20, status, alerts, forecast | Engine and tests done (`calculations/budget.ts`). UI shows the suggestion only. No saved budgets or notifications. |
| 5 Savings and discipline | Goals, challenges, score | Not started. |
| 6 Multi-currency | Rates, conversions, cross-currency transfers | Money engine stores rate with each conversion (tested). No rate provider or UI. |
| 7 Bank integration | Adapter, sandbox, consent, sync | Not started. Provider availability in Namibia must be researched first; nothing is assumed. CSV and text import already work. |
| 8 AI assistant | Grounded assistant | Not started. |
| 9 Reports, OCR, automation | PDF/Excel export, month-end jobs, photo/PDF text recognition | Not started. |
| 10 Security and release | Device testing, PIN/biometrics, AAB, accessibility audit | Not started. |

## Document scanning (requested addition)
Works now: bank statement CSV, pasted statement text, pasted payslip text. Parse, categorise with a confidence score, detect duplicates, show totals, require confirmation. See [scanning.md](scanning.md).
Not built: reading text out of photos and PDFs (OCR). Planned for Stage 9 as a Supabase Edge Function so no AI key is in the app.
