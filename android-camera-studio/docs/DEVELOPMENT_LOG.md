# Development log

## 2026-11-01: first working version
- Environment: OpenJDK 21, Gradle 8.14.3 on the PATH, no Android SDK, no KVM, no device. Installed Android command line tools, platform 35, build tools 35 and platform tools under `/opt/android-sdk`.
- Maven Central returned HTTP 429 through the sandbox proxy. Worked around with a user level Gradle init script (not committed) that points Maven Central at Google's mirror. The committed build uses the normal repositories.
- Created the project in `android-camera-studio/` so the existing Pesa web app is untouched.
- Built the pure Kotlin enhancement pipeline first with unit tests. Two first time failures were test mistakes (gains derived from encoded instead of linear values; a test scene too saturated to count as neutral), fixed in the tests.
- Added Android layers: storage, Room, DataStore, CameraX engine, camera screen, enhancement worker, gallery, compare view, photo editor, video trim, settings, navigation.
- Lint: fixed opt in annotations for CameraX `getCameraInfo` and Media3 `ExportException` codes, and a `produceState` pattern. 0 errors remain; 78 warnings (mostly newer dependency versions available, and style).
- Result: 41 unit tests pass; debug APK and unsigned minified release APK build. Nothing has run on a phone yet.

## 2026-11-01: AI image studio (user request)
- User asked for an image generation studio like ChatGPT's image tool and chose to support both an online and an on device engine.
- Online: OpenAI Images API with the user's own key (Keystore encrypted), consent dialog, HTTPS only. No key exists in this environment, so it is unit tested with a fake transport but has not been called for real.
- On device: MediaPipe `tasks-vision-image-generator` 0.10.26.1. The API was read from the AAR with `javap` (`createFromOptions`, `setInputs`, `execute`). Native code is arm64 only (about 44 MB uncompressed), so the debug APK grew. The Stable Diffusion model is not bundled or downloaded; the user imports a converted folder. No public download URL was invented.
- Added INTERNET permission (used only by the online engine) and updated the in app privacy text.
- 50 unit tests pass.
