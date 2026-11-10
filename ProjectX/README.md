# Project X: Combat Racing

An original 3D combat racer that runs in the browser on Windows PC and Android (WebGL, built with three.js).

## What is in this build

- 8 vehicles with different handling: Wisp GT, Bastion, Dune Hound, Brawler V8, Halo S, Warden, Slipstream, XR-1 Prototype.
- 6 circuits: Desert Canyon, Futuristic Industrial City, Mountain Highway, Abandoned Military Zone, Tropical Jungle, Neon Metropolis. Plus one combat arena, The Crucible.
- 7 weapons plus nitro: machine guns, rockets, homing missiles, land mines, EMP, explosive shells, shield.
- Game modes: Career (10 events with story, 2 boss races), Quick Race, Championship (6 rounds, points), Time Trial, Combat Arena, Boss Battles.
- Garage: 3D showroom, buying, 8 upgrade types with 3 levels each, paint, wheel colour, starting weapon.
- 7 AI rivals with their own skill, aggression and defence, plus 2 bosses. Difficulty: Easy, Normal, Hard, Extreme.
- Damage: paint darkens, smoke then fire as armour drops, explosion and respawn when wrecked.
- Local save with a checksum and a backup copy. Nothing needs an internet connection after loading.
- Graphics tiers Low, Medium, High with automatic choice and automatic resolution lowering when frame rate drops.
- Touch controls (resizable, can be mirrored), keyboard and game controller.

## Audio

Voice over and some effects were generated with ElevenLabs, voice "Odom - Deep, Powerful, Dramatic":
intro narration, countdown (three, two, one, go), final lap, race over, weapon armed, explosion, machine gun, engine.
"Wrecked", "Victory", "New lap record", rocket and EMP clips were not generated because the free ElevenLabs queue was busy. The game uses built in synthesised sounds for those until the files are added to `assets/audio/` with these names: `wrecked.mp3`, `victory.mp3`, `record.mp3`, `rocket.mp3`, `emp.mp3`.
Check the ElevenLabs terms for your plan before selling the game with these clips.

## Build and run

```
npm install
npm run build          # writes dist/
npm run serve          # serves dist/ on http://localhost:8377
```

Open `http://localhost:8377` on a PC. On an Android phone on the same network open `http://<pc-address>:8377`, then use the browser menu "Add to Home screen" to install it full screen. A hosted copy works the same way.

## Installable apps

Windows (Electron launcher in `desktop/`): download the Windows Electron zip for the version in `desktop/package.json`, rename `electron.exe` to `Project X.exe`, copy `desktop/main.js` and `desktop/package.json` into `resources/app/`, and copy `dist/` into `resources/app/game/`. Run `node tests/desktop.mjs <electron-binary> <app-dir>` to test it.

Android (WebView app in `android/`): needs JDK 17+ and the Android SDK (platform 34, build-tools 34.0.0).
```
npm run build
cp -r dist/. android/app/src/main/assets/www/
cd android && ANDROID_HOME=<sdk path> ./gradlew assembleRelease
```
The APK is written to `android/app/build/outputs/apk/release/`. It is signed with a sideload key (`android/projectx-release.jks`, password in `android/app/build.gradle`). Make your own key before publishing anywhere. Google Play needs an app bundle (`bundleRelease`) and your own key.

## Tests

```
npm run serve &        # in one terminal
npm test               # full: all 6 circuits, trial, arena, boss, difficulties (about 8 minutes)
npm run test:quick     # one race
npm run shots          # screenshots of menus, garage, race, arena and a phone view into shots/
```

The simulation tests drive every car with the AI and fail on any script error, any race that does not finish, or lap times outside 25 to 110 seconds.

## Controls

Keyboard: arrows or WASD drive, Space drift, Shift nitro, F or J fire, R back onto the track, C camera distance, Esc pause.
Controller: left stick steer, right trigger accelerate, left trigger brake, A nitro, X fire, B drift, Y reset, Start pause.
Touch: on screen buttons. Size and side can be changed in Settings.

## Known issues and limits

- Tested in headless Chromium with software graphics only. It has not been played on a physical Android phone yet; frame rate on real phones is not confirmed.
- Vehicles and scenery are built from code (simple shapes), not modelled art. This is far from Unreal Engine visual quality.
- No online multiplayer.
- Not a native Windows .exe or Android .apk. It can be wrapped later (for example Electron for Windows, Capacitor for Android) if store releases are wanted.

## Code layout

- `src/data.js` vehicles, tracks, weapons, characters, career
- `src/track.js` circuit and arena builder
- `src/car.js` vehicle model and driving physics
- `src/combat.js` particles, projectiles, weapons, pickups
- `src/ai.js` opponent driving and combat
- `src/game.js` race session, laps, damage, camera
- `src/audio.js` sound
- `src/ui.js` menus, HUD, garage, results
- `src/save.js` save and recovery
- `src/main.js` renderer, quality tiers, input, mode flow, rewards
- `src/page.html` page and styles
