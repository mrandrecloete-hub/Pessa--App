# Scanning and import

Code: `packages/shared/src/scanning`. UI: `apps/android/src/app/import.tsx`. Tests: `packages/shared/tests/scanning.test.ts`.

## Bank statements
1. `parseStatementCsv` finds the header row and the Date, Description, Amount or Debit/Credit, Balance columns (comma, semicolon or tab). Unreadable rows are reported, never invented.
2. If it is not a CSV, `parseStatementText` reads one transaction per line from pasted or OCR text. Amounts must have two decimals and digit groups, so two columns cannot merge. When there is no sign or CR/DR marker, direction is taken from the change in running balance; otherwise it stays `unknown`.
3. `categorise` uses Namibian and regional merchant rules (Shoprite, Engen, NamPower, MTC, ...) and the user's own rules, and returns a confidence from 0 to 1.
4. Rows below 0.75 confidence, or with unknown direction, are `needsReview`. They are not imported until the user fixes them. Nothing is ever marked verified automatically.
5. `fingerprints` gives each row an idempotency key (account, date, amount, direction, normalised description, occurrence number). Importing the same file again adds nothing; two identical purchases in one file are both kept.
6. Totals (`summariseCandidates`) exclude duplicates and unknown-direction rows.

## Payslips
`parsePayslip` extracts employer, pay period, gross, net, and PAYE/social security/pension/medical lines. It checks gross minus deductions against net and lowers confidence if they differ. Only net pay is recorded as income. Deductions are not expenses.

## Limits
- Text only. No OCR yet (Stage 9).
- Day-first dates. Currency symbols other than the listed ones are not stripped.
- The category rules are keyword based and will be wrong sometimes, which is why low confidence rows need confirmation.
- Tested on synthetic samples, not on real bank or payslip layouts. Real statements from each bank must be added as fixtures before relying on it.

## Photos and PDFs (receipt, payslip, bank statement)
Code: `apps/android/src/app/scan.tsx`, `apps/android/src/lib/extract.ts`, `supabase/functions/extract-document`, `packages/shared/src/scanning/extraction.ts`.

Flow: the user photographs or picks a file, the app sends it to the `extract-document` Edge Function (signed in users only), the function asks a vision model for JSON, and the app validates that JSON again. Amounts and dates are re-parsed by our own parsers, payslip totals are re-checked, bank rows go through the same duplicate and review pipeline, and the user confirms everything before it is saved.

To turn it on:
```bash
supabase functions deploy extract-document
supabase secrets set ANTHROPIC_API_KEY=...      # server only, never in the app
```
and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Status: the handler and validation are unit tested with a mocked model (`packages/shared/tests/extract-handler.test.ts`, `extraction.test.ts`). It has NOT been run against the real model, deployed, or used with a real camera. Limits: about 5 MB per file, no rate limiting yet, receipts in a foreign currency must be converted by hand until Stage 6. Documents are sent to the AI provider, so a privacy notice and user consent screen are needed before release.
