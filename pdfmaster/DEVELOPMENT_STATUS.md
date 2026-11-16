# PDFMASTER development status

Version 0.4.0. Last updated 16 November 2026. App icon and Home logo replaced with the new PDF and wrenches logo (source: `branding/`). Home screen and app icon redesigned to the midnight-blue direction (dark theme is now the default; light and system themes remain in Profile).

## The most important limit of this report
The app has **not been run on a real phone or emulator yet**. The build machine has no emulator support. What was verified is listed under "Tests". Anything that needs a real screen, camera or Android's own PDF renderer (page display, zoom gestures, the editor's touch handling, scanning, OCR, sharing, file pickers, notifications) is written and compiles but is **untested on a device**. Expect bugs there until the first device test.

## APK build status
| Item | Status |
| --- | --- |
| Debug APK | Built from CI or `./gradlew :app:assembleDebug` |
| Release APK | Built and signed: `app/build/outputs/apk/release/app-release.apk` (about 39 MB). Pushes build it automatically: see `.github/workflows/pdfmaster-build.yml` |
| Signature | Verified with `apksigner verify` (APK Signature Scheme v2), zip alignment checked |
| Package | `com.pdfmaster.app`, min Android 8.0 (API 26), target API 35, arm64-v8a and armeabi-v7a |
| Installed on a device | **Not done** |
| Code shrinking (R8) | Off on purpose until it can be tested on a device; turning it on should roughly halve the size |

## Tests
`./gradlew :app:testDebugUnitTest`: **40 passed, 0 failed.** `python3 tools/verify_outputs.py`: **8 passed, 0 failed.**

| Suite | What it proves |
| --- | --- |
| PdfOpsTest (12) | Page lists, merge, split, extract, delete, reorder, rotate, watermark, page numbers, header on rotated pages, AES 256 encryption (file refuses to open without the password, raw bytes do not contain the text), remove password, metadata read, strip, set, compression (76 percent smaller on a picture PDF, text kept), extract pictures, pictures to PDF, compare, permanent redaction (text is gone from the file), repair of a truncated file |
| ConvertTest (9) | DOCX, XLSX, PPTX, HTML, RTF, TXT to PDF using sample files made by python-docx, openpyxl and python-pptx; PDF (made by reportlab) to DOCX, XLSX, CSV, HTML, RTF, TXT, PNG, JPG, TIFF, PPTX; every output is reopened and its content checked |
| EditFormsAiTest (5) | All editor item types written to a PDF (also on a rotated page) with the original text intact; searchable text layer; form read, fill, required check, flatten, reset; adding new fields then filling them; on-device analysis |
| AppLaunchTest (1) | The real app starts (dependency injection, database, settings, navigation) and Home, Tools, a tool screen, the file picker sheet, Documents, AI Assistant, Profile, AI settings and Privacy policy open. Simulated Android (Robolectric), not a phone |
| AppFlowTest (1) | Import into the library, merge, split, PDF to Word, batch conversion, protect, the password prompt (missing and wrong password), unlock, metadata, compare, page numbers, a failed job saving nothing, history without passwords, delete, temporary files removed |
| ScanCleanTest (4) + AppFlowTest scan case | Clean up scan: a synthetic badly lit scan (yellow tint, shading, dark corner) becomes even white paper with dark text and a red logo kept; Black and white gives only black and white pixels; pages are fitted to A4 and real typed text is placed over painted-out lines (unsure lines are left alone); the original scan is kept. Run through the real tool path |
| UpdaterTest (7) | Release list parsing (ignores other apps, drafts, pre-releases and releases without the APK), version order, download from a local test server, checksum match, tampered file rejected and deleted, missing checksum refused, up to date, skip, metered network waits, plain http refused. **The Android installer step itself (PackageInstaller) is not covered by any test**: it needs a real phone |
| verify_outputs.py (8) | The produced DOCX, XLSX, PPTX, TIFF and PDF files open correctly in independent libraries (python-docx, openpyxl, python-pptx, Pillow, pypdf) |

Not covered by any test: everything in the first section, and the cloud AI connection (no account was available).

## Modules

### Complete (built and engine tested; screens untested on a device)
- Project foundation: Kotlin, Compose, Material 3, MVVM, Hilt, Room, DataStore, Navigation, WorkManager (daily temp clean up), scoped storage with the system file picker (no storage permission).
- Design system: brand colours, light and dark themes, adaptive app icon.
- Navigation: Home, Tools, Documents, AI Assistant, Profile.
- Home: search, import, scan, 10 quick actions, running work with stop button, recent, favourites, recently converted, activity, storage.
- Documents: filters (all, recent, favourites, imported, scanned, converted, signed, edited, shared), search, sort by date, name, size, type, rename, copy, delete with confirmation, share, save to device, open with another app.
- Organise: merge, split (each page, every N, ranges), extract, delete, rotate, visual page organiser (drag to reorder, rotate, duplicate, delete), watermark, page numbers, header and footer, extract pictures, extract text, repair.
- Compression: low, balanced, high, custom; before and after size and percent; original always kept.
- Protect: AES 256 password with verification, permissions, remove password, metadata view, removal (verified) and edit, permanent redaction.
- Convert from PDF: DOCX (editable or exact look), XLSX, CSV, PPTX, TXT, RTF, HTML, PNG, JPG, TIFF. Batch for several files. History with retry of failed jobs.
- Convert to PDF: JPG, PNG, WebP pictures; DOCX, XLSX, PPTX, HTML, RTF, TXT.
- Forms: detect and fill text, multi-line, check box, option button and list fields; required field check; flatten; reset; reusable saved answers; add new text fields and check boxes to a static PDF.
- Signatures: draw, initials, import picture, reuse, delete, place, move, resize; date insert.
- Opening PDFs from other apps ("Open with", "Share to").

### Partial (works within the stated limit)
- Viewer: continuous and single page modes, pinch zoom, double tap zoom, thumbnails, go to page, text search with results list, copy page text, bookmarks, rotate view, dark reading mode, full screen, share. **Limits:** search results are listed by page but not highlighted on the page; text is selected in a text panel, not directly on the page.
- Editor: text, pictures, freehand drawing, highlight, underline, strike out, cover box, rectangle, circle, line, arrow, comments (real PDF annotations), stamps, tick, cross, undo, redo, save as new copy. **Limit:** this is overlay editing. Text already in the PDF cannot be retyped in place; the app says so and offers Cover plus Text, or Redact.
- PDF to Word, Excel, HTML, RTF: text, headings, bold, paragraphs and tables are rebuilt from page positions. Pictures are not carried into the editable Word file (the "exact look" mode keeps everything as page pictures). Multi-column and complex layouts can come out in a different order. Each result screen says this.
- PDF to PowerPoint: each slide is a picture of the page (not editable text).
- Office to PDF: text, headings, bold, italic, underline, colour, lists, tables and pictures are kept. Exact fonts, columns, headers, footers, charts, cell colours and slide design are not. Not a pixel-exact Office renderer.
- OCR: Latin script languages only (bundled model). Recognised text is shown and can be copied, but there is no screen yet to correct it before saving.
- Scan clean up (new in 0.3.0): after scanning, pages are evened out (shadows, tint and paper colour removed), sharpened and fitted to A4, in colour, greyscale or black and white. The optional Rebuilt look retypes recognised text as real sharp text over painted-out original lines; logos, stamps, signatures and handwriting stay as pictures, and lines the recogniser is unsure about (under 70 percent) are left as they were. Also available for any PDF as Tools, Clean up scan. **Tested only on synthetic pages: the real ML Kit recognition and real camera scans have not been tried, so Rebuilt may misread text and its output must be checked.** Result is not guaranteed to be perfect for very crumpled pages, strong glare or very dark photos.
- Scanner: uses Google's document scanner (edges, crop, perspective, filters, multi-page). Needs Google Play services; the first use may need internet to download the scanner.
- Compare: compares text page by page. Pictures and layout are not compared.
- AI assistant: on the phone it picks key sentences, extracts dates, amounts, emails, phones, links and likely names, and finds passages matching a question, all with page numbers. This is text analysis, not a language model. Real summaries, explanations, translation, notes and table extraction use an optional cloud model (Claude or an OpenAI compatible service) with the user's own key, off by default, with consent per document. **The cloud path has never been run against a live service.** Answers can be saved as a Word document.
- Background work: jobs run off the main thread, survive leaving the screen, show progress and can be stopped. They do **not** survive the app being closed by Android, and interrupted jobs are not resumed.
- Tablets: layouts adapt (grids), but there is no dedicated two-pane tablet design.
- Settings: profile name, theme, default export format, compression, picture quality, OCR after scan, AI privacy, storage and temp files, notifications, about, privacy policy, terms. Language is English only. Save location is the in-app library plus "Save to device".

- Automatic updates (new in 0.4.0): on start and every 6 hours the app reads the public GitHub release list, downloads a newer signed APK (full download, Wi-Fi only in the background), checks its SHA-256 and package and hands it to Android, which also refuses a different signing key. Android 12 and newer can install later updates without a prompt while the app is closed; the first one asks once, and the user must allow "install unknown apps" for PDFMASTER once. Switch in Profile, Updates. **Not yet tested on a real phone.** There are no small delta patches (every update is a full download of about 38 MB).

### Not built yet
- "Pro" badge and drag and drop import from the design mock-up (there is no Pro plan; import is tap to browse).
- Editing existing PDF text in place (needs a commercial grade PDF engine).
- Certificate based digital signatures and signature verification.
- Old DOC, XLS, PPT files and TIFF as input.
- Creating option button, drop down and date fields (text fields and check boxes can be created).
- OCR for non Latin scripts; OCR correction screen.
- Built-in cloud drive browsers (Google Drive, OneDrive and similar already appear in the Android file picker when their apps are installed).
- Drag and drop import, a backend, user accounts.
- App languages other than English.

## Known issues and risks
1. No device testing (see top). Highest risk areas: editor touch handling at zoom levels above 100 percent, viewer zoom combined with scrolling, very large PDFs on low memory phones.
2. A diagonal watermark is real text in the page, so it appears inside copied or extracted text afterwards.
3. Operations on a password protected PDF (other than "Protect") save the result without the password; protect it again if needed.
4. Text added to PDFs uses the bundled DejaVu font: Latin, Greek and Cyrillic work; Arabic, Hebrew, Indic and East Asian scripts are replaced by "?".
5. Privacy policy and terms inside the app are plain descriptions of how this version behaves, not reviewed legal documents.

## Next steps (in order)
1. Install on two or three real phones and fix what the first device test finds.
2. Turn on code shrinking and retest.
3. Search highlighting on the page, OCR correction screen, WorkManager for long conversions.
4. Certificate signatures; more field types; more OCR languages.
