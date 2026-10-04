# Pesa architecture

Pesa is one file, `index.html`, plus a service worker (`sw.js`), a manifest, fonts and a few helper folders. There is no build step and no server of its own. This page tells a new developer where things live and how to change them safely.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| App | `index.html` | HTML, CSS and all the JavaScript in one script, wrapped in one function so nothing leaks into the page |
| Offline shell | `sw.js` | Caches the app so it opens without internet. Its `CACHE` name must change with every release |
| Install details | `manifest.json`, icons | Lets Pesa be installed like an app |
| Legal text | `docs/legal.json`, `site/` | Terms, privacy, refunds, built into the app and the marketing pages by `tools/build_legal.py` and `tools/build_site.py` |
| Database setup | `docs/provisioning/` | The SQL a shop runs in its own Supabase project |
| Accounting reference | `src/utils/pesaAccountant.ts`, `docs/accounting/` | A typed reference engine and the SQL ledger. The page engine in `index.html` is checked against it |
| Tests | `tests/` | Browser tests, see below |

## The ideas that hold the app together

* **State and Store.** `State` holds what is on screen. `Store.collection(name)` reads and writes records (`doc(id).set/update/delete`, `add`, `onSnapshot`). Records are saved on the device first (IndexedDB, with a localStorage fallback). Add a collection by adding it to `initRefs()` and `subscribeAll()`, and to the backup lists (`backupPayload`, `restoreBackupData`).
* **Sync.** `Sync` copies every write into an outbox and sends it to the shop's own Supabase table `pesa_docs`. Version 2 (the default for new setups) locks every record with AES-GCM on the device and uses a hashed workspace name, so the cloud owner cannot read the data. Version 1 is the older readable copy and stays supported until a shop taps Upgrade. A new collection syncs automatically.
* **Words.** Every screen text goes through `tr('English text')`. Afrikaans and German live in `LANGS.af.strings` and `LANGS.de.strings`, added with `Object.assign(...)`. The English text is the key, so changing an English sentence means changing its keys too. Later assignments win.
* **Screens.** `openSheet(html)` opens a bottom sheet and returns the overlay. `closeModal()` closes it. Full height pages (the chat) add the class `mv-full` to the sheet.
* **Roles.** `isOwner()`, `isManagerOrOwner()` and the job list decide who sees what. Employees only see the parts their job needs.
* **Money.** Sales and the books count in whole cents. The Accountant page builds journals from the records every time and hashes each filed month.
* **Documents.** All PDFs go through `newPdfDoc` and the shared drawing helpers. `saveGeneratedPdf(doc, filename, opts)` offers every download format (PDF, Word, Excel, CSV, web page, rich text, plain text, picture), so a new document gets all formats by using it.
* **Chat media.** Photos are shrunk to about 300 KB and voice notes capped at two minutes so a record stays well under the 2 MB limit of the cloud table. Old media is removed after the keep time chosen in the inbox.

## Map of `index.html`

Line numbers move, so regenerate this list with `python3 tools/section_map.py`.

```
  1169  helpers
  1201  i18n
  1659  businesses on this device
  1717  persistence (IndexedDB, with localStorage fallback)
  1832  store (db capability, with local fallback)
  2060  automated cloud sync
  2291  state
  2341  select mode / bulk delete
  2585  audit trail
  2611  company / staff accounts / login / roles
  2768  password reset by email
  3221  FINGERPRINT / FACE VERIFICATION (passkeys, WebAuthn)
  3430  SECURITY: guess limits, password rules, auto sign-out, security check
  3514  CHECK THIS COMPUTER (compatibility)
  3572  BUSINESS TOOLS
  4853  ELITE TOOLS
  5068  SPEED CHECK AND TEST PRODUCTS
  5202  PILOT FEEDBACK FORM
  6129  EMPLOYEE ACCOUNTS: invite, sign up, personal dashboard
  6310  EMPLOYEE TRACKING, MESSAGES, WORK REPORTS, RECORDS
  7406  till / cash-up (cash register reconciliation)
  7589  toast
  7600  modal helpers
  7643  ICONS (inline, small)
  7681  small chart helpers
  7719  TAB: SELL
  8193  POINT OF SALE (terminal)
  8830  TAB: STOCK
  8975  BULK STOCK IMPORT
  9277  IMAGE HELPERS (logo)
  9302  PDF HELPERS
  9304  DOCUMENT AND APP FONTS
  9479  PESA DOCUMENT DESIGN (PDF)
 10362  SEND: email / WhatsApp / SMS
 10754  INVOICE ARCHIVE
 10814  INVOICES PAGE
 11027  ON-DEVICE ALERTS (Notification API)
 11172  INVOICES
 11627  MONTHLY REPORT
 11912  REPORT FOR ANY DATES
 11990  MONTHLY REPORT ARCHIVE
 12420  TAB: CREDIT
 12452  CREDIT SALE (products + customer details)
 12736  TAB: EXPENSES
 12808  TAB: DASHBOARD
 13006  ABOUT / CREDIT
 13027  SETTINGS
 13044  DASHBOARD SIDE DRAWER
 13484  main render / router
 13780  BARCODE SCANNING
 13878  BLUETOOTH THERMAL RECEIPT PRINTING
 13996  SALES INSIGHTS (dashboard)
 14048  SYNC STATUS
 14125  SUPPLIERS
 14182  PURCHASE ORDERS
 14326  BRANCHES (multi-branch)
 14389  WASTAGE / SHRINKAGE
 14442  AUDIT TRAIL VIEWER
 14453  ACCOUNTANT
 15266  NAMRA VAT SUMMARY
 15339  LICENCE AND FREE TRIAL
 15545  TRAINING
 16961  PESA SMART TOOLS
 17354  RECONCILIATION PAGE
 17983  AUTOMATIC BACKUPS
 18147  DATA HEALTH CHECK
 18192  WHAT'S NEW
 18325  NEARBY WI-FI SYNC (no internet)
 18556  PRIVACY AND CONFIDENTIALITY
 18694  ABOUT PESA
 19155  boot
 19160  OPENING ANIMATION
 20065  TAX RECORDS (NamRA ready)
```

## Releasing a change

1. Change `index.html`.
2. Raise `APP_VERSION` and add the same version at the top of `CHANGELOG` (the check below enforces this).
3. Change the `CACHE` name in `sw.js` (for example `pesa-shell-v55`) so phones fetch the new app.
4. Run `npm test`. For a quick check run `npm run check`.
5. Commit and push to `main`. GitHub Pages publishes in about ten minutes. Tell shops to reload twice.

## Tests

`npm install` once, then `npm test`. The runner builds `tests/.build/index.html` (the real app plus a hook that exposes every top level function as `window.__t`), serves it, and runs each file in `tests/specs/`. `npm test -- chat acct` runs only specs whose file name contains those words. Specs write screenshots and downloads to `/tmp/pesa-tests/` (set `PESA_OUT` to change that).

Two kinds of output look like failures but are not: a proxy tunnel error when the machine has no internet, and the word FAILED printed as data in a status line. The runner already ignores both.

What the tests cannot do: they run in Chromium. Real Safari, real phones, real printers, real card machines and real microphones need the hand checks in `docs/DEVICE_TEST_PLAN.md`.
