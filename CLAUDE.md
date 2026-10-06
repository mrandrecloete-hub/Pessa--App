# Pesa ("Your Mula, Your Pride")

Single file vanilla HTML/CSS/JS PWA for shop management and point of sale (Namibia). App: `index.html` (about 3 MB). Also `sw.js`, `manifest.json`, `version.json`, `media/`, `docs/`, `tools/`, `tests/`.

## Rules
- Improve only; do not remove working features. No dashes in app wording.
- Be honest: never claim 100 percent secure, legally compliant, accredited, or approved by NamRA or any body. Tax, privacy and records wording says "to be confirmed with the relevant legal bodies, authorities and entities of Namibia".
- Training is for internal staff training and development only (records, not certificates).
- Store badges (App Store, Google Play) stay out until the app is on those stores.
- Every release: bump `APP_VERSION` and top `CHANGELOG` entry in index.html, `version.json`, and the cache name in `sw.js`; run `python3 tests/check.py`. Commit, `git push origin HEAD:main` (repo mrandrecloete-hub/Pessa--App), and publish index.html (plus sw.js, version.json) to the Claude artifact.

## Code layout
- Source blocks are edited in `tools/*.js` and embedded with `python3 tools/embed_block.py NAME file.js 'anchor'`: HARDEN1 `harden_core.js` (guards, audit chain, sessions, removal approval), HARDEN2 `harden_tax.js` (VAT in cents, rate history), HARDEN3 `harden_fin.js` (refunds, numbering, till), HARDEN4 `harden_ops.js` (backups, recovery, integrity report, privacy controls, clear sales, removal sheet). Also `embed_courses.py`, `embed_intro.py`. Re-run after editing the source.
- Data: `Store.collection(name)`, `refs.x.doc(id).set/update/delete`, `State.*`. `Store.setGuard(dataGuard)` enforces rules in the data layer.
- Important deletes need a manager or owner password and a reason (`withRemoval`, `askRemovalSheet`).

## Tests
`python3 tests/build.py` then `NODE_PATH=$(npm root -g) node tests/run.js <names>`. Specs in `tests/specs`. Run long batches in the background. Known failing before recent work: acct_t, back_t, bio_t, chat_off_t, cp_t, dev_t, elite_t, fx_t, inv_t, lesson_t, lic_t, mv_t, perf_t, pesaad_t, speed_t, tm_t. Some specs are flaky under load (courses_t, acct3_t, pf2_t, about_t2).
See `docs/PRODUCTION_AUDIT.md` for the security and compliance review.
