# Releasing BlazeCam (GitHub releases, in-app updates)

BlazeCam updates itself from the GitHub releases of this repository (tags `blazecam-vX.Y.Z`). Installed apps
check the public release list at most once a day (or from Settings > Updates), show the release notes, and
install only when the user taps Update. The APK's SHA-256 is checked against `SHA256SUMS.txt` before install,
and Android refuses any update that is not signed with the same key as the installed app.

- App ID: `com.blazecam.app` (permanent; never change it)
- Release signing certificate SHA-256:
  `44:F0:37:33:C0:8F:0A:6B:2E:4D:5A:26:84:51:5F:10:0E:DA:D4:1A:65:FF:8C:EB:4A:E9:47:51:79:8E:9A:8C`
- Version code is derived from the version: 1.2.3 -> 10203. Every release must have a higher version.

## One-time setup: signing secrets

In GitHub: repository Settings > Secrets and variables > Actions > New repository secret. Add these four
(values are in the file you were given when the key was created; keep that file and `blazecam-release.jks` backed up):

| Secret | Value |
|---|---|
| `BLAZECAM_KEYSTORE_BASE64` | the long base64 text |
| `BLAZECAM_KEYSTORE_PASSWORD` | the store password |
| `BLAZECAM_KEY_ALIAS` | `blazecam` |
| `BLAZECAM_KEY_PASSWORD` | the key password |

If the key is lost, installed apps can never be updated again: users would have to uninstall and reinstall.
No key or password is stored in this repository.

## Publishing a release

Either:
1. GitHub > Actions > **Release BlazeCam** > Run workflow > enter the version (e.g. `0.3.0`) and what changed.
   The button appears once `.github/workflows/blazecam-release.yml` is on the default branch (`main`).
2. Or push a tag from any branch: `git tag blazecam-v0.3.0 && git push origin blazecam-v0.3.0`.

The workflow runs all unit tests, builds the APKs for each CPU type, signs them with the secret key, checks
the signature, writes `SHA256SUMS.txt`, and publishes the GitHub release. Phones see it at their next check.

## Installing the first time

Download `BlazeCam-X.Y.Z-arm64-v8a.apk` (almost all phones) from the release page and open it. Android asks
once to allow installs from the browser, and BlazeCam asks once (when updating) to allow it to install updates.
The earlier test builds used the ID `com.example.aicamerastudio` and a temporary key: uninstall that test app.

## Notes
- Google Play does not allow apps that install their own updates (`REQUEST_INSTALL_PACKAGES`). If BlazeCam moves
  to Play later, remove the updater for that build and let Play update it.
- Debug builds (`com.blazecam.app.debug`) cannot be updated by release APKs.
