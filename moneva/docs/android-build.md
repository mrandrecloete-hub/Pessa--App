# Building a test APK

Produces an installable APK for testing on a phone. It is signed with the Android debug key, so it is not a Play Store build.

Needs: JDK 17 or newer, Android SDK with `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`.

```bash
cd moneva && npm install
cd apps/android
npx expo prebuild --platform android          # generates android/ (git ignored)
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android
EXPO_PUBLIC_DEMO=1 ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# output: app/build/outputs/apk/release/app-release.apk
```
Leave out `EXPO_PUBLIC_DEMO=1` for a build without the "Load demo data" button. Leave out `-PreactNativeArchitectures` to include all phone types (bigger file, slower build).

If Gradle fails with HTTP 429 from Maven Central, the network is rate limiting. Put Google's mirror (`https://maven-central.storage-download.googleapis.com/maven2`) first in an init script in `~/.gradle/init.d/`, keeping `gradlePluginPortal()` as a fallback.

Test build 1.0.0 (8 Nov 2026): arm64, about 44 MB, target SDK 36, minimum Android 7.0 (SDK 24). Built and checked (package, signature, bundle) but not yet run on an emulator or phone.
