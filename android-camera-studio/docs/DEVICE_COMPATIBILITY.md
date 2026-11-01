# Device compatibility

| Configuration | Status |
|---|---|
| Physical Android device | **Not tested.** None was connected. |
| Emulator | **Not tested.** The build machine has no KVM, so no emulator could run. |
| JVM unit tests | 41 tests pass (pipeline, planner, analyser, validator, codec, history, geometry, trim validation, job states, errors). |
| Build | Debug APK and minified release APK build with compileSdk 35. Lint: 0 errors. |

Minimum Android 10 (API 29). Camera behaviour depends on each phone's CameraX support; quality, frame rate, stabilisation, flash, zoom range and exposure compensation are all read from the device at runtime and hidden when absent.

Please record each device you test here: model, Android version, what worked, what failed.
