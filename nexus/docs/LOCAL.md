# NEXUS NAMIBIA on one device (no server)

Like Pesa: install it and use it. Everything you enter is stored on the phone (browser storage). There is no account, no server and no internet needed after install.

## Android app
Install `NEXUS-NAMIBIA-local.apk` (debug signed: allow "install unknown apps"). The whole app is inside the APK.
Rebuild: `npm run build:local -w @nexus/web` then `cd apps/android-shell && gradle assembleDebug`. Build with `-PserverUrl=https://host` to get the server version of the app instead.

## Browser / PWA
`npm run build:local -w @nexus/web` writes static files to `apps/web/out`. Serve that folder at the ROOT of a web address (any static host, for example `python3 -m http.server` inside `out`, or a GitHub Pages site on its own domain). Open it on a phone and use "Add to Home screen". A service worker caches every file so it then works offline. It does not work from a sub-folder address.

## Cloud sync (optional)
Menu, Cloud Sync: enter the https address of your NEXUS server and sign in (or create an account). The phone stays the working copy and the server keeps one backup copy per account, so a second phone can load the same data. Sync runs a few seconds after each change and when the app opens.
- Never silent overwrite: if the cloud and the phone both changed, you are asked which copy to keep. The copy you drop is lost, so use Backup first if unsure.
- Server side: `GET/PUT /api/v1/sync` (one snapshot per user, revision number, 1.5 MB limit, only NEXUS backups accepted, audit logged). The server must allow the app origin: `CORS_ORIGINS=https://appassets.nexus.local` (already set in `deploy/docker-compose.yml`). For a browser copy of the on-device app, add its address too.
- Needs a deployed server (docs/DEPLOYMENT.md). It is a whole-copy sync, not field by field merging, so edits on two phones at the same moment need the choice above. The server stores the data as one block; it is not yet split into the relational tables used by the server version, so national statistics and institution views cannot read it.
- Tokens are kept in the phone's app storage, not in a secure keystore.

## What is different from the server version
- One business profile per device. No sign in, no password, no sharing between devices.
- The directory has 3 DEMONSTRATION programmes. Real programmes are added by you (Funding Directory, Add a Programme). A programme only shows as Verified if you record the official website and your source and tick the box; it then says it was checked by you on this device.
- Backup: Backup page copies all your data as text. Uninstalling the app or clearing site data erases everything, so back up.
- Not available on the device: password recovery, multi-user roles, institution and national portals, AI, document vault (none exist in either version yet).

## Honest status
Fixed in 1.1.1: the first local APK showed a blank "Loading" screen because Android drops asset folders starting with an underscore (Next.js `_next`); the build now keeps them and a replay of the APK contents passes.

Tested: the full journey in a real browser against the static build (profile, directory, matching, readiness, plan, add programme, backup and restore, persistence across reloads). Not tested: the APK on a real phone or emulator (none available in the build environment). The Android file serving code is small but unproven.
