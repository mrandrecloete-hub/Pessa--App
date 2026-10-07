# Pesa ("Your Mula, Your Pride")

Vanilla HTML/CSS/JS PWA for shop management and point of sale (Namibia). The page is `index.html` (small shell and CSS); ALL app code is in `app.js` (about 2.3 MB, loaded as `app.js?v=VERSION` so the phone keeps its compiled code ready). The Afrikaans and German word lists are `lang_af.js` and `lang_de.js`, loaded only when that language is chosen. Also `sw.js`, `manifest.json`, `version.json`, `media/`, `docs/`, `tools/`, `tests/`.

## Rules
- Improve only; do not remove working features. No dashes in app wording.
- Be honest: never claim 100 percent secure, legally compliant, accredited, or approved by NamRA or any body. Tax, privacy and records wording says "to be confirmed with the relevant legal bodies, authorities and entities of Namibia".
- Training is for internal staff training and development only (records, not certificates).
- Store badges (App Store, Google Play) stay out until the app is on those stores.
- Every release: bump `APP_VERSION` and top `CHANGELOG` entry in app.js, the `app.js?v=` in index.html, `version.json`, and `APPJS` plus the cache name in `sw.js`; run `node tests/check.js`. Commit, `git push origin HEAD:main` (repo mrandrecloete-hub/Pessa--App), and publish index.html (plus app.js, lang_af.js, lang_de.js, sw.js, version.json) to the Claude artifact.

## Code layout
- Source blocks are edited in `tools/*.js` and embedded into app.js with `python3 tools/embed_block.py NAME file.js 'anchor'`: HARDEN1 `harden_core.js` (guards, audit chain, sessions, removal approval), HARDEN2 `harden_tax.js` (VAT in cents, rate history), HARDEN3 `harden_fin.js` (refunds, numbering, till), HARDEN4 `harden_ops.js` (backups, recovery, integrity report, privacy controls, clear sales, removal sheet). Also `embed_courses.py`, `embed_intro.py`. Re-run after editing the source.
- The Accountant page (`openAccountantSheet`, the Profit and Loss report, the register of reports in `State.settings.acctReports`, verify and copy tools) is edited in `tools/accounts_ui.js` and embedded with `node tools/embed_accounts_ui.js`. The books engine (`acctGather`, `acctBuild`, `acctView`, monthly filing and its hash chain) is separate and must not change without tests: `npm test -- acct`.
- Business types (`State.company.businessType`: beauty, retail, hospitality) live in `tools/verticals.js` (VERT block, embed with `python3 tools/embed_block.py VERT verticals.js`). Retail is the default and the full dashboard. See `docs/BUSINESS_TYPES.md`. Spec: `vert_t`.
- Data: `Store.collection(name)`, `refs.x.doc(id).set/update/delete`, `State.*`. `Store.setGuard(dataGuard)` enforces rules in the data layer.
- Important deletes need a manager or owner password and a reason (`withRemoval`, `askRemovalSheet`).

## Tests
`npm install` once, then `npm test` (Node only, Windows/Mac/Linux): it runs `tests/check.js`, compiles the accountant TypeScript, builds `tests/.build`, serves it and runs every spec in `tests/specs`. `npm test -- name1 name2` runs only specs whose file name contains those words. Run long batches in the background. Still failing: lesson_t (narration and speech in headless Chromium), mv_t and tm_t (messaging specs use selectors from the older inbox, e.g. `[data-msg]`), issuer_t (needs the pdfinfo and pdftotext tools). Everything else passes.  Specs that need sample stock call `biz_boot(p, {demo:true})`; new businesses start empty and a first run setup guide opens by itself after about 2 seconds, and a pilot feedback reminder sheet opens about 5 seconds after sign in, so `biz_boot` switches both off (saved with `btSave` and `pfSave`, not by setting State directly, which a settings sync can overwrite). Inline sign up flows in specs do the same.
Direct sending: email goes through the owner's EmailJS account (`emailSendNow`, optional PDF attachment on paid plans), WhatsApp through `supabase/functions/whatsapp` (logic in `_shared/wahandler.mjs`, tested by `node tests/wa_t.mjs`, setup in `docs/provisioning/WHATSAPP.md`). The in app firewall is `tools/harden_fw.js` (HARDEN5). Specs `fw_t`, `notif_t`, `mailany_t` cover them. PDF specs can only run where the PDF library can load (it comes from cdnjs).
See `docs/PRODUCTION_AUDIT.md` for the security and compliance review.
