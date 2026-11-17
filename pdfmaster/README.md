# PDFMASTER (Android)

PDF editor, converter and document manager for Android phones and tablets. Native Kotlin and Jetpack Compose (no WebView). Package `com.pdfmaster.app`, version 0.1.0.

This folder is a separate Gradle project inside the Pesa repository. It does not touch the Pesa web app.

Read `DEVELOPMENT_STATUS.md` for exactly what works, what is partial, what is not built yet and what has and has not been tested.

## Requirements
- JDK 17 or newer (built here with OpenJDK 21)
- Android SDK with platform 35 and build tools 35
- The Gradle wrapper (Gradle 8.10.2) is included
- Phones: Android 8.0 (API 26) or newer, ARM (arm64-v8a or armeabi-v7a)

## Build and test
```
./gradlew :app:testDebugUnitTest     # 28 tests: PDF engine, converters, forms, app launch and tool flow
python3 tools/verify_outputs.py      # opens the converted files with python-docx, openpyxl, python-pptx, pypdf, Pillow
./gradlew :app:assembleDebug         # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease       # app/build/outputs/apk/release/app-release.apk (signed when a key is configured)
```
`python3 tools/make_fixtures.py` rebuilds the sample documents in `app/src/test/resources/fixtures` (needs `pip install python-docx openpyxl python-pptx reportlab pillow pypdf`).

## Release signing
No key or password is stored in the repository. The build reads them from either:
- `keystore.properties` in this folder (ignored by git):
  ```
  storeFile=/absolute/path/pdfmaster-release.jks
  storePassword=...
  keyAlias=pdfmaster
  keyPassword=...
  ```
- or the environment variables `PDFMASTER_KEYSTORE_FILE`, `PDFMASTER_KEYSTORE_PASSWORD`, `PDFMASTER_KEY_ALIAS`, `PDFMASTER_KEY_PASSWORD` (for CI secrets).

Make a key once with:
`keytool -genkeypair -keystore pdfmaster-release.jks -alias pdfmaster -keyalg RSA -keysize 2048 -validity 10000`

Keep that key file and its password safe and backed up. Android only installs an update over an existing app when it is signed with the same key. Without a key, `assembleRelease` produces an unsigned APK that cannot be installed.

## Install on a phone
1. Copy `app-release.apk` to the phone (or download it there).
2. Open it. Android asks to allow installs from that source (Files, Chrome, WhatsApp and so on): allow it once.
3. Tap Install. Play Protect may ask to scan an app it has not seen before: choose scan or install anyway.

With a cable: `adb install -r app/build/outputs/apk/release/app-release.apk`.

## Structure
- `engine/` pure document logic, no screens: `PdfOps` (merge, split, rotate, watermark, encrypt, compress, redact, compare, repair), `PdfExport` (PDF to DOCX, XLSX, PPTX, HTML, RTF, TXT, CSV, PNG, JPG, TIFF), `DocImport` (DOCX, XLSX, PPTX, HTML, RTF, TXT to PDF), `Ooxml` (Office file writers), `Overlay` (editor items and searchable text layer), `PdfForms`, `LocalAi`.
- `tools/` the tool catalogue (`Tools.kt`: one entry per tool with its options and run code), OCR (ML Kit) and the optional cloud AI client.
- `data/` Room database, settings (DataStore), the private document library, the background job runner and the daily clean up worker (WorkManager, Hilt).
- `ui/` Compose screens: Home, Tools, Documents, AI Assistant, Profile, viewer, editor, form filler, page organiser, scanner, signatures.

## Libraries and licences
PdfBox Android 2.0.27 (Apache 2.0), Jetpack Compose, Material 3, Room, DataStore, WorkManager, Navigation, Hilt (all Apache 2.0), Google ML Kit text recognition and document scanner (ML Kit terms; the scanner needs Google Play services), DejaVu fonts (free licence, bundled for text in created PDFs). MuPDF and iText were not used because their AGPL licences would force the whole app to be open source or need a paid licence. Confirm these licences for your own distribution before publishing commercially.

## Automatic updates
Installed apps update themselves from the GitHub releases of this repository (tags `pdfmaster-vX.Y.Z`). See `docs/RELEASING.md` for the one-time setup (four signing secrets) and how releases are published. `VERSION` holds the lowest version a release may have: raise it when you want a bigger version jump.
