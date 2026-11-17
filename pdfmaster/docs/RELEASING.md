# Releasing PDFMASTER (GitHub releases and in-app updates)

Installed apps update themselves from the GitHub releases of this repository (tags `pdfmaster-vX.Y.Z`). They check the public release list when opened and every few hours, download the APK, verify its SHA-256 against `SHA256SUMS.txt`, and let Android install it. Android refuses any update that is not signed with the same key as the installed app.

- App ID: `com.pdfmaster.app` (permanent, never change it)
- Version code is made from the version: 1.2.3 gives 10203. Every release must have a higher version than the one before.
- `pdfmaster/VERSION` is the lowest version a release may have. Releases count up from it (0.4.0, 0.4.1, ...). Raise it to jump to a new minor or major version.

## One-time setup: the four signing secrets
GitHub: repository Settings > Secrets and variables > Actions > New repository secret. Add these four (values are in the `github-secrets.txt` you were given; delete that file after use, and keep `pdfmaster-release.jks` backed up):

| Secret | Value |
| --- | --- |
| `PDFMASTER_KEYSTORE_BASE64` | the long base64 text |
| `PDFMASTER_KEYSTORE_PASSWORD` | the store password |
| `PDFMASTER_KEY_ALIAS` | `pdfmaster` |
| `PDFMASTER_KEY_PASSWORD` | the key password |

If the key is lost, installed apps can never be updated again: people would have to uninstall (losing their documents) and reinstall.

## Publishing
Automatic: every push to `main` that changes `pdfmaster/` runs the tests, builds the signed APK and publishes the next version as a GitHub release, with notes from the commit messages. Pushes to other branches build an APK as a downloadable artifact only (Actions > the run > Artifacts).

By hand: Actions > "PDFMASTER build" > Run workflow (needs the workflow on `main`), optionally with a version.

## What a phone does
1. Opens the app, or the background job runs: reads the release list (one small request).
2. Newer version found: shows "Update available" with the notes (or, in the background, downloads on Wi-Fi and shows "ready").
3. The user taps Update. The first time, Android asks to allow PDFMASTER to install apps from this source.
4. Android installs over the old version. Documents and settings are kept.
On Android 12 and newer, once the app has installed an update itself, later updates install by themselves while the app is closed.

## If something goes wrong
- "Signature does not match": the installed copy was signed with another key (for example an early test build). Uninstall it once and install the release from GitHub.
- No update appears: the release must be published (not a draft), tagged `pdfmaster-vX.Y.Z`, with `PDFMASTER-X.Y.Z.apk` and `SHA256SUMS.txt` attached, and have a higher version than the phone.
- GitHub limits anonymous requests to 60 an hour per network; "Check for updates now" may say to try later.
