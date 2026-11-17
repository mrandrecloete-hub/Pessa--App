# Pesa Hospitality Namibia ("Your Mula, Your Pride", under it "(Hospitality System)")

Vanilla HTML/CSS/JS PWA for lodges, guest houses, hotels, restaurants and bars (Namibia). It runs like Pesa: static files on free hosting (GitHub Pages), each property's data saved on its own devices, and optional sync through the property's own Supabase project. There is no app server and no dependency on Render or any host that has to stay awake. The page is `index.html`; ALL app code is in `app.js` (loaded as `app.js?v=VERSION`). Word lists are `lang_af.js` and `lang_de.js`. Also `sw.js`, `manifest.json`, `version.json`, `docs/`, `tools/`, `tests/`.

Origin: built from the Pesa retail engine (version 2026.10.206) with its hospitality layer restored, in Pesa's own green and gold. Its sister is Pesa Retail Namibia (repository Pessa--App); this one is named Pesa Hospitality Namibia on the tab and when installed. The feature list follows the RoyalStay Intelligence server app, rebuilt to run on the device (see docs/HOSPITALITY.md). The separate server version (NestJS and Postgres) lives in the private repository Hospitality-Intelligence-. This app is hospitality only: there is no choice of business type.

## Rules
- Improve only; do not remove working features. No dashes in app wording.
- Be honest: never claim 100 percent secure, legally compliant, accredited, or approved by NamRA or any body. Tax, privacy, levy, licence and records wording says "to be confirmed with the relevant legal bodies, authorities and entities of Namibia".
- No animations: the app runs in the simple look (`html.lite`). Do not add live motion.
- Double bookings are checked on the device before saving. Two devices that book the same room before they sync can clash: it must be shown clearly afterwards for someone to fix, never hidden.
- Every release: bump `APP_VERSION` and the top `CHANGELOG` entry in app.js, the `app.js?v=` in index.html, `version.json`, and `APPJS` plus the cache name in `sw.js`; run `node tests/check.js`; then commit and push to `main` (GitHub Pages publishes in about two minutes).
- The legal owner name for copyright and the terms is "Pesa Hospitality" until the owner confirms it.

## Code layout
- Source blocks are edited in `tools/*.js` and embedded into app.js with `python3 tools/embed_block.py NAME file.js` (VERT `verticals.js` is the hospitality layer: rooms, bookings, stays, folios, tabs, kitchen and bar board, guests, licences and levy; HOSP `hospitality.js` is the extra hospitality tools (room calendar, find a free room, waiting list, housekeeping, split bill, recipes and food cost, team clock and ratings, occupancy and rates, guest messages; embed with `python3 tools/embed_block.py HOSP hospitality.js 'Store.ready.then(function(){
  initRefs();'`; spec `hosp_t`); also ENT `enterprise.js`, BLAZE, SMARTAI, AGENT, HARDEN1 to HARDEN4). The accountant page is `tools/accounts_ui.js` with `node tools/embed_accounts_ui.js`. Re-run after editing the source; `node tests/check.js` says when a block is out of date.
- Hospitality only: `bizType()` always returns 'hospitality' and the sign up has no type choice (`tools/verticals.js`).
- Data: `Store.collection(name)`, `refs.x.doc(id).set/update/delete`, `State.*`. Money that is added up by payment method must go through `salePayParts`.
- Important deletes need a manager or owner password and a reason (`withRemoval`).

## Tests
`npm install` once, then `npm test` (Node only): it runs `tests/check.js`, builds `tests/.build`, serves it and runs every spec in `tests/specs`. `npm test -- name1 name2` runs only specs whose file name contains those words. Run long batches in the background. Specs that need sample stock call `biz_boot(p, {demo:true})`.
