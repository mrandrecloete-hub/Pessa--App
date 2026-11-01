# Device compatibility

| Configuration | Status |
|---|---|
| Physical Android device | **Not tested.** None was connected. |
| Emulator | **Not tested.** The build machine has no KVM, so no emulator could run. |
| AI studio, online | Request/response logic unit tested; **never called against the real OpenAI API**. |
| AI studio, on device | **Not run.** Needs an arm64 phone (the MediaPipe native library ships only arm64-v8a), a capable GPU and an imported model of about 2 GB. |
| Ultra zoom, Composite Studio UI | **Not run on a device.** Engines tested on the JVM with the real models (see QA_TEST_PLAN.md). |
| JVM unit tests | 83 tests pass (pipeline, planner, analyser, validator, codec, history, geometry, trim validation, job states, errors). |
| Build | Debug APK and minified release APK build with compileSdk 35. Lint: 0 errors. |

Minimum Android 10 (API 29). Camera behaviour depends on each phone's CameraX support; quality, frame rate, stabilisation, flash, zoom range and exposure compensation are all read from the device at runtime and hidden when absent.

Please record each device you test here: model, Android version, what worked, what failed.

## APK size (measured)
Release APK per CPU type: arm64-v8a 70.8 MB, armeabi-v7a 53.4 MB, x86_64 56.8 MB. App Bundle 91.8 MB (Google Play delivers one CPU type). Most of the size is ONNX Runtime (about 34 MB uncompressed on arm64), the MediaPipe image generator (about 45 MB, arm64 only) and the three bundled models (33 MB). 32 bit x86 is excluded.

## Speed (measured on the build machine's JVM, not a phone)
Segmentation of a 512x512 photo about 0.1 s; removal of the whole astronaut (about 45% of a 512x512 frame) 2.5 s; 640x427 composite render 15 ms; Real-ESRGAN 48x48 -> 192x192 about 0.07 s. Phone timings will differ and have not been measured.
