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
