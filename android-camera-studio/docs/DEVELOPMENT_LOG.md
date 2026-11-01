# Development log

## 2026-11-01: first working version
- Environment: OpenJDK 21, Gradle 8.14.3 on the PATH, no Android SDK, no KVM, no device. Installed Android command line tools, platform 35, build tools 35 and platform tools under `/opt/android-sdk`.
- Maven Central returned HTTP 429 through the sandbox proxy. Worked around with a user level Gradle init script (not committed) that points Maven Central at Google's mirror. The committed build uses the normal repositories.
- Created the project in `android-camera-studio/` so the existing Pesa web app is untouched.
- Built the pure Kotlin enhancement pipeline first with unit tests. Two first time failures were test mistakes (gains derived from encoded instead of linear values; a test scene too saturated to count as neutral), fixed in the tests.
- Added Android layers: storage, Room, DataStore, CameraX engine, camera screen, enhancement worker, gallery, compare view, photo editor, video trim, settings, navigation.
- Lint: fixed opt in annotations for CameraX `getCameraInfo` and Media3 `ExportException` codes, and a `produceState` pattern. 0 errors remain; 78 warnings (mostly newer dependency versions available, and style).
- Result: 41 unit tests pass; debug APK and unsigned minified release APK build. Nothing has run on a phone yet.
