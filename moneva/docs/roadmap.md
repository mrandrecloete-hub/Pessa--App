# Roadmap and honest status

| Stage | Scope | Status |
|---|---|---|
| 1 Foundation | Expo shell, routing, tokens, logo, Supabase client, lint/test setup | Done. Android bundle compiles; UI checked in a headless browser. Not run on a real Android device yet. |
| 2 Auth and onboarding | Sign up, login, recovery, profile, currency, accounts | Partly done: Welcome, Login, Create account and Forgot password screens call Supabase Auth and work only once Supabase is configured (not tested against a real project). No email verification screen, profile, PIN or accounts setup. Google and Apple sign in are not built. |
| 3 Accounts and transactions | Local ledger, add income/expense, history, search, delete | Partly done: single account, base currency only, stored on the device (AsyncStorage). No edit screen, no transfers screen, no cloud sync yet. |
| 4 Budgeting | Suggested split 50/30/20 and 60/20/20, status, alerts, forecast | Engine and tests done (`calculations/budget.ts`). UI shows the suggestion only. No saved budgets or notifications. |
| 5 Savings and discipline | Goals, challenges, score | Goals and contributions work (local, tested, never counted as spending or as a bank transfer). Challenges, streaks and the discipline score are not built. |
| 6 Multi-currency | Rates, conversions, cross-currency transfers | Money engine stores rate with each conversion (tested). No rate provider or UI. |
| 7 Bank integration | Adapter, sandbox, consent, sync | Not started. Provider availability in Namibia must be researched first; nothing is assumed. CSV and text import already work. |
| 8 AI assistant | Grounded assistant | Not started. |
| 9 Reports, OCR, automation | PDF/Excel export, month-end jobs, photo/PDF text recognition | Photo and PDF reading is written (Edge Function + app screens) and unit tested with a mocked model, but not deployed or tried on a real device or the real model. A simple Reports screen (6 month bars, categories) works. No exports, notifications or scheduled jobs. |
| 10 Security and release | Device testing, PIN/biometrics, AAB, accessibility audit | Not started. |

## Design
The look follows the owner's mockups in `assets/branding/design-*.png` (dark emerald and gold, owner supplied logo). Home, bottom bar, Welcome, Login, Add Transaction, Transaction History, Savings Goals, Budget Overview and Financial Reports follow it. Not built from the mockups: AI Assistant, Bank Integration, Bills, Debt, Currency Management, Notifications, Financial Discipline score, Profile, Google/Apple login. The 3D logo is a raster crop of the mockup (about 700 px), so a high resolution original should replace it before store release.

## Document scanning (requested addition)
Works now offline: bank statement CSV, pasted statement text, pasted payslip text. Parse, categorise with a confidence score, detect duplicates, show totals, require confirmation. See [scanning.md](scanning.md).
Not built: reading text out of photos and PDFs (OCR). Planned for Stage 9 as a Supabase Edge Function so no AI key is in the app.
