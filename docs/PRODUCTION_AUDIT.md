# Pesa production audit (v2026.10.86)

This is an honest engineering review, not a certificate. Pesa is not 100 percent secure and is not guaranteed to be legally compliant. NamRA has not approved Pesa.

Legend: **Implemented** = built into the app. **Tested** = covered by an automated test in `tests/specs`. **Needs external confirmation** = needs a lawyer, accountant, NamRA or a security professional.

## Status summary

| Area | Status | Notes |
|---|---|---|
| Security | Improved, not complete | Client side only app. Anyone who controls the browser or device can change local data. |
| Data integrity | Improved | Sales and audit entries cannot be edited or deleted in the app; originals of deleted records are archived. |
| Accounting integrity | Improved | Whole cent arithmetic, balanced journals, integrity report. |
| Offline and sync | Partly hardened | Last write wins on conflicts; there is no per field merge. |
| Backup and recovery | Improved | Fingerprinted, verified backups. Copies on one device are lost with the device. |
| Privacy | Tools added | Owner remains responsible for lawful use. |
| Namibian tax readiness | Recording tools only | No NamRA approval or integration. |
| Legal risk | Needs professional review | See below. |

## Findings

### Critical (fixed)
- Role could be taken from the saved session, so a forged session could give owner rights. Role is now read from the staff record. **Implemented, Tested** (sec2_t).
- Completed sales and audit entries could be edited or deleted. Now blocked by a data guard; deletions keep an archived original with who, when, why and a hash. **Implemented, Tested**.
- Service role (secret) keys could be pasted into sync forms. Now rejected. **Implemented**.

### High (fixed)
- Audit log was not tamper evident. Now a per device hash chain, verified on screen. **Implemented, Tested**.
- Cashiers could reset other accounts. Staff password reset needs owner role and a password again. **Implemented, Tested**.
- Uploads were not checked. Images are verified by content, SVG and program files are refused, size limited. **Implemented, Tested**.
- Backups could be restored from damaged or changed files. Now checked and fingerprinted, a safety backup is taken first. **Implemented, Tested** (ops_t).
- VAT used floating point and a fixed rate. Now whole cents with a dated rate history. **Implemented, Tested**.
- Refunds could exceed the sale. Now limited by what was sold, with reason and approval. **Implemented, Tested**.

### Medium
- Login lockouts, session expiry (7 days or long inactivity), idle sign out default 30 minutes. **Implemented, Tested**.
- Double submit on money buttons. Guards added on sale, refund and till close. **Implemented**. Other forms: **remaining**.
- CSV formula injection helper (`secCell`) exists. **Remaining:** apply it to every export writer.
- Document numbers are unique per device. **Implemented**. Cross device gaps are possible while offline.

### Low
- Wording: "tamper proof" replaced by "tamper evident" where found. Translation strings (Afrikaans, German) should be re checked. **Remaining**.

## Remaining risks (be aware)
1. All data lives in the browser. Clearing site data erases it. Download copies and keep them elsewhere.
2. A person with access to the device and developer tools can change local data. The audit chain makes this visible, it does not prevent it.
3. The cloud connection uses last write wins. Two devices editing the same record offline will keep the later write.
4. Password and PIN checks run in the browser.
5. Content Security Policy is not fully tightened because the app is a single file with inline code.
6. Tax rate history and VAT categories must be set correctly by the owner.

## Recommended professional reviews
- A Namibian lawyer: privacy duties for customer and employee data, electronic records and signatures, retention periods.
- A registered accountant or tax practitioner: VAT treatment, rate settings, record keeping periods.
- NamRA: written confirmation before Pesa is described as approved or integrated.
- An independent security review or penetration test before handling a large number of customers.

## Required notices shown in the app
- Privacy: "Designed to support privacy and applicable legal requirements. The business owner remains responsible for lawful use of customer and employee information."
- Tax: "Pesa provides business and tax-recording tools. It does not replace professional tax advice and does not claim NamRA approval unless expressly confirmed by NamRA."
- Electronic records: "Electronic records and signatures are subject to applicable Namibian law and the specific requirements of the transaction."

## Tests
Run `npm test` (or `NODE_PATH=$(npm root -g) node tests/run.js ops sec2`). Key specs: `ops_t` (tax self test, refunds, backups, recovery, integrity, privacy), `sec2_t` (security), `vat_t`, `acct*_t`.
The in app Accounting Integrity Report (Business, Integrity) runs 17 tax cases plus audit chain, journal balance, refund and stock checks on the live data.
