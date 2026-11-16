# PDFMASTER for Windows

Desktop version of PDFMASTER (Kotlin and Compose Desktop). It runs on Windows 10 and 11 (and, from source, macOS and Linux). The installer is a normal `.msi`: download `PDFMASTER-Desktop-X.Y.Z.msi` from the GitHub releases and double-click it. It installs for the current user (no administrator needed) and adds a Start menu entry. The installer is **not code signed** (no certificate yet), so Windows SmartScreen may say "Windows protected your PC": choose More info, then Run anyway.

Installed apps update themselves: when it opens (at most once an hour) the app reads the public GitHub releases tagged `pdfmaster-desktop-vX.Y.Z`, shows an "Update now" bar, downloads the installer, checks its SHA-256 against `SHA256SUMS.txt` and runs Windows Installer, which upgrades the app in place. Settings are in the About page.

## What it can do
PDF viewer (continuous scroll, zoom with Ctrl and the wheel, text search), merge, split, extract, delete, rotate, compress, watermark, page numbers, password protection (verified), remove password, remove metadata, repair, PDF to Word, Excel, PowerPoint, text, CSV, HTML, RTF, TIFF and pictures, pictures and Office files to PDF, and Professional Document Restoration with a before and after slider. Drag and drop works on the home screen. Every tool saves a new file; originals are never changed.

Not in the Windows version yet: editing and drawing on PDFs, form filling, signatures, the camera scanner, searchable text (OCR), and the AI assistant.

## One engine, two apps
The document engine (PDF tools, converters, restoration) is **the Android app's own source**: `pdfmaster/app/src/main/java/com/pdfmaster/app/engine`. The build copies it (`syncEngine` in `build.gradle.kts`), changes the PDFBox package name from the Android port to the desktop original, and compiles it with small replacements for Android's picture classes (`src/main/kotlin/shim`) and `engine/Pdfx.kt`. A fix to the engine therefore reaches both apps. Everything in `com.pdfmaster.desktop` (screens, tools list, updater) is desktop only.

## Build and test
```
./gradlew test                  # engine, restoration, updater and screen rendering tests
./gradlew run                   # start the app
./gradlew packageMsi            # Windows installer (must run on Windows, needs WiX 3; CI does this)
./gradlew createDistributable   # runnable app folder for the current system
```
The version is in `VERSION`; the release workflow counts up from it. See `.github/workflows/pdfmaster-desktop.yml`.
