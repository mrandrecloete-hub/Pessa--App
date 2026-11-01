# AI Camera Studio (Android)

Native Android camera and media studio in Kotlin + Jetpack Compose. Package `com.example.aicamerastudio` (change `namespace` and `applicationId` in `app/build.gradle.kts` before release).

This folder is a separate Gradle project inside the Pesa repository. It does not touch the Pesa web app.

## Requirements
- JDK 17 or newer (built here with OpenJDK 21)
- Android SDK with platform 35 and build tools 35 (Android Studio Ladybug or newer works)
- The Gradle wrapper (Gradle 8.10.2) is included

## Build and test
```
./gradlew :app:testDebugUnitTest      # JVM unit tests (pipeline, editor logic, errors, job states)
./gradlew :app:lintDebug              # Android lint, aborts on errors
./gradlew :app:assembleDebug          # debug APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease        # minified, UNSIGNED release APK
./gradlew :app:connectedDebugAndroidTest   # needs a device or emulator (none were available when this was written)
```
Install the debug APK with `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

Release signing is not configured on purpose. Add your own `signingConfig` using properties kept out of git.

## Selected versions
AGP 8.7.3, Kotlin 2.0.21, KSP 2.0.21-1.0.28, Compose BOM 2024.12.01, CameraX 1.4.1, Room 2.6.1, DataStore 1.1.2, Media3 1.5.1, WorkManager 2.10.0, Navigation 2.8.5, Lifecycle 2.8.7, Activity Compose 1.9.3, Coroutines 1.9.0. compileSdk and targetSdk 35, minSdk 29 (scoped storage baseline, so no storage permission is needed). All are Apache 2.0 licensed AndroidX or JetBrains libraries.

## Documentation
- `docs/ARCHITECTURE.md`: modules and data flow
- `docs/FEATURE_STATUS.md`: what is done, partial, and not started
- `docs/DEVICE_COMPATIBILITY.md`: what has and has not been tested
- `docs/DEVELOPMENT_LOG.md`: what was done, in order
