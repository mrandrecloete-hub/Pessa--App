# Pesa fiscal layer (NamRA ITARIS / ITAS)

Offline-first e-invoicing design for Pesa. A sale never waits for tax or network. Every receipt is built and saved on the device first, then cleared in the background.

## Status

- NamRA has published no e-invoicing specification and no API. No law requires shops to connect yet; the budget points to 2028 or later.
- Every `namra_*` column, the payload shape (`pesa.namra.mock/1`) and the clearance response are **mock**. They sit behind two replaceable pieces: `createHttpTransport()` and `buildPayload()`.
- Real-time clearance in Namibia is not an agreed workflow yet. Pesa receipts therefore show honest text for each state (cleared, pending, failed).
- The module is embedded in `index.html` (version 2026.10.06) and **off by default**. An owner switches it on in Settings, Tax records. See "Integration".

## Files

| File | Purpose |
|---|---|
| `001_namra_efd.sql` | Task 1. Supabase migration: types, tables, guards, projection trigger, reports, RLS. |
| `pesa-efd.js` | Tasks 2 and 3. Dependency-free module for browser and Node: money, payload, hash chain, outbox, queue worker, clearance parser, receipt and ESC/POS footer. |
| `mock-namra.js` | Scriptable mock clearance service (in-process and real HTTP). |
| `test_efd.js` | 35 tests, `node docs/efd/test_efd.js`. |
| `test_sql.py` | 30 checks against a throwaway Postgres 16, `python3 docs/efd/test_sql.py` (needs `pgserver`, `psycopg2-binary`). |
| `sample_records.js` | Sample outbox records used by `test_sql.py`. |

## Architecture

```
checkout (cashier)                       background                          shop's own Supabase
------------------                       ----------                          -------------------
finalizeSale()
  1. save sale                (local, as today)
  2. enqueueSale()            build payload -> seal (SHA-256) -> save PENDING
  3. print receipt            fiscal footer = pending text
                                         Tax Sync Queue worker
                                         every ~15 s, on 'online', on tab visible
                                         PENDING -> SUBMITTED -> CLEARED | FAILED
                                               |  batch POST (idempotent)
                                               v
                                         NamRA (mock today)
  4. reprint later            footer = IRN + signature + QR

local outbox (collection fiscalOutbox) --Pesa cloud sync (~15 s)--> pesa_docs
pesa_docs --trigger pesa_fiscal_project()--> fiscal_invoice, _line, _tax_pool (typed, checked, sealed)
```

Rules the code enforces:

1. `enqueueSale()` catches every error and returns `{ok:false}`. A build failure leaves a visible `FAILED` marker (`build-<saleId>`) and uses no sequence number.
2. Nothing is deleted. A receipt leaves `PENDING` only for `CLEARED` or `FAILED`; `FAILED` stays on disk and in Postgres.
3. Money is whole cents. VAT is per line, half up, integer arithmetic. Prices stay VAT-inclusive, as in Pesa today.
4. Send is idempotent. Key: `tin:branchCode:terminalId:sequence`.
5. Sequence is gap-free per terminal. Each receipt carries `previousHash`, so a missing or edited receipt breaks the chain and `fiscal_chain_report()` shows where.

## Task 1: schema

Apply once per shop: Supabase SQL editor, paste `001_namra_efd.sql`, run. Safe to re-run.

| Table | Holds |
|---|---|
| `fiscal_taxpayer` | Merchant TIN, VAT number, legal name |
| `fiscal_branch` | Branch code under a TIN |
| `fiscal_terminal` | Terminal/Device ID under a branch, `last_seq`, `last_hash` |
| `fiscal_invoice` | One row per receipt: identity, totals in cents, `previous_hash`, `payload_hash`, full `payload`, `sync_status`, `attempts`, `next_attempt_at`, `last_error`, `namra_irn`, `namra_qr_code_url`, `namra_signature`, `cleared_at` |
| `fiscal_invoice_line` | Line items with `tax_category` (`STANDARD`, `ZERO_RATED`, `EXEMPT`) and `rate_bp` |
| `fiscal_invoice_tax_pool` | VAT per category and rate on each receipt |
| `fiscal_anomaly` | Receipts the trigger refused or could not project |

Types: `namra_sync_status` (`PENDING`, `SUBMITTED`, `CLEARED`, `FAILED`), `namra_tax_category`.

Database-level guarantees (tested):

- `gross = net + vat` on invoice, line and pool.
- Standard needs `rate_bp > 0`. Zero-rated needs `rate_bp = 0` and no VAT. Exempt needs no rate and no VAT.
- `CLEARED` requires IRN, QR address (https only) and signature.
- Unique per terminal sequence, unique idempotency key, unique IRN.
- A sealed invoice cannot change content. `CLEARED` cannot revert or change its IRN, QR or signature. Nothing can be deleted, including by the table owner.
- A rewrite with a different hash is logged to `fiscal_anomaly` and not applied. A malformed receipt is logged and never fails the app's sync write.
- RLS uses the same `x-pesa-code` rule as `pesa_docs`. The app can read the fiscal tables and cannot insert, update or delete them. Only the trigger writes.

Reports: `fiscal_vat_summary` (VAT by month, category and rate), `fiscal_queue_status`, `fiscal_chain_report(ws)`.

## Task 2: Tax Sync Queue

`createTaxSyncWorker({storage, transport, onEvent, config})` returns `tick`, `start`, `stop`, `resume`, `retryFailed`, `counts`.

`start()` calls `tick()` every 15 s plus jitter, on the browser `online` event, and when the tab becomes visible. `tick()` never rejects and never overlaps itself.

| Outcome | Action |
|---|---|
| Device offline | Skip. Nothing changes. |
| Network error or 15 s timeout | Back to `PENDING`, `attempts+1`, full-jitter exponential delay (5 s base, 15 min cap), global cooldown. |
| 408, 425, 429, 5xx | Same. `Retry-After` is honoured. |
| 401, 403 | Queue blocks (`state.blocked='AUTH'`), receipts stay `PENDING`, `blocked` event. Call `resume()` after the credentials are fixed. |
| Other 4xx on a batch | Each receipt is marked solo and retried alone to isolate the bad one. |
| Other 4xx on a single receipt | `FAILED` with the reason. Kept. |
| 200, item `CLEARED` | Validated by `parseClearance()`, stored, `CLEARED`. |
| 200, item `REJECTED` | `FAILED` with the reason. Kept. |
| 200, item missing | Retried. |
| Clearance fails validation | `FAILED` (`CLEARANCE_HASH_MISMATCH`, `BAD_SIGNATURE`, `BAD_QR_URL`, `BAD_IRN`, `SIGNATURE_INVALID`). Never `CLEARED`. |
| App closed mid-send | `SUBMITTED` older than 2 min returns to `PENDING`. |
| 12 failed attempts | One `stuck` event. Retrying continues. |

The owner can press "Retry failed" (`retryFailed()`) after fixing the cause.

## Task 3: cart to payload, response to receipt

```js
const payload = PesaEfd.buildPayload(sale, { seller, sequence, previousHash });   // throws on bad input
await PesaEfd.sealPayload(payload, sha256);                                        // adds integrity.hash
```

`sale` is the object `finalizeSale` already builds, plus an optional `taxCategory` per item. Payload fields:

- `seller` (tin, vatNumber, name, branchCode, terminalId), `buyer`
- `invoice` (type, sequence, number, issuedAt UTC, localOffset, currency, idempotencyKey)
- `lines[]` (gross, net, vat, taxCategory, ratePct), `totals` (gross, net, vat, `pools[]` by category and rate)
- `payments[]`, `integrity` (previousHash, hash)

`hash` is SHA-256 over canonical JSON (sorted keys) with `integrity.hash` removed. It throws `TOTAL_MISMATCH` if the lines do not add up to the receipt total.

Response handling: `parseClearance(record, item, cfg)` checks IRN, https QR, signature shape, that `payloadHash` equals the local hash, and an optional `verifyClearance(hash, signature, irn)` hook for NamRA's real signature check. It returns `{ok, clearance}` or `{ok:false, code}`.

Printing:

```js
const footer = await PesaEfd.printableFooter(storage, terminalId, sequence);   // bytes: text block, and QR when CLEARED
const bytes  = PesaEfd.withFiscalFooter(escposReceiptBytes(draft, shopName), footer);   // lands before the paper cut
await writeBleInChunks(blePrinterChar, bytes);
```

Status text printed: cleared (IRN, sequence, terminal, shortened signature, TIN, QR), pending (reference and 8-character check code), failed ("Keep this slip"). All lines fit 32 columns.

## Integration into `index.html` (done)

Source files: `docs/efd/pesa-efd.js` (module) and `tools/efd_app.js` (Pesa glue). `python3 tools/embed_efd.py` copies both into `index.html` between `/*EFD:START*/` and `/*EFD:END*/`. Edit the sources, not the generated block.

| Piece | Where |
|---|---|
| Settings | Settings, Tax records. Owner only, only where data is stored on the device (not in the Claude app preview). Shared: on/off, TIN, branch code. This device only (`localStorage`, never synced): Terminal ID, address, access key. |
| Terminal ID | Locked after the first tax record on a device. Every device needs its own, or two devices would share one invoice sequence. |
| Products | Tax category (standard, zero rated, exempt) appears in the product form only while tax records are on. Items without a category count as standard. |
| Checkout | `finalizeSale` and the credit sale sheet call `Fiscal.track(sale, addPromise)`. It is never awaited; every error is swallowed. The sale gets `fiscalId` once the record exists. |
| Storage | `Store.batchSet()` writes the record and the sequence counter in one save. `fiscalOutbox` and `fiscalMeta` are ordinary collections, so the existing 15 s sync copies them to `pesa_docs`. |
| Worker | Starts at launch (and when settings are saved) only when an https address and key are set. It sends only this device's records, so records pulled from other devices are never sent twice. |
| Receipts | Bluetooth: the footer goes before the paper cut, with the QR code when cleared. PDF receipt: VAT split by standard, zero rated and exempt, plus IRN, signature stub and verify address. Both only show once an address and key are set, or the receipt is cleared. |
| Owner screen | Counts (waiting, cleared, needs attention), connection state, failed receipts with the reason, Send now, Retry failed, Resume. |

Behaviour to know:

- A shop with VAT rate 0 cannot switch tax records on (the database requires a positive rate for standard lines).
- A receipt total may differ from the sum of rounded lines by up to 50 cents without blocking the record (sub-cent fractions on weighed items). The tax record always uses the rounded lines.
- Run `001_namra_efd.sql` in the shop's Supabase project to get the typed tables; the app works without it.
- The tax record covers sales only. Credit notes, voids and refunds are not recorded yet (open question 4).
- 8 UI checks run against a mock endpoint in the browser: off by default, validation, mixed-category sale, clearance, receipt PDF, Bluetooth bytes, offline sale never blocked, queue drains on reconnect.

## Open questions

Resolve these before connecting to NamRA:

1. Real endpoint, authentication method and per-device credentials, and whether a device needs registration or a certificate.
2. Real field names, invoice numbering rules and whether the authority assigns the sequence.
3. How the signature is verified, and whether the QR address is fixed or returned.
4. Credit notes and cancelled sales: format and linkage to the original receipt (the schema already allows `CREDIT_NOTE` and `DEBIT_NOTE`).
5. Offline limits: how long a receipt may stay uncleared, and whether a printed pending receipt is legally acceptable.
6. Rounding rule (per line or per invoice) and the treatment of VAT-inclusive pricing. The current choice is per line, half up.
7. Whether small shops below the N$1,000,000 VAT threshold are in scope at all.
