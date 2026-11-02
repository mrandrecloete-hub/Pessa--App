# QA test plan: ultra zoom and AI Composite Studio

Status legend: **Automated, passed** = executed by `./gradlew :app:testDebugUnitTest` on the build machine (JVM, real ONNX models where noted).
**Needs device, not run** = requires a phone or emulator; none was available. Nothing in the second group has been executed.

Test photos: `astronaut` and `rocket` from scikit-image (NASA, public domain), stored as raw RGB in `app/src/test/resources`.

## Zoom

| Case | Status | Evidence |
|---|---|---|
| Lens factors from focal length and sensor size | Automated, passed | `ZoomAndMultiFrameTest.lensFactorsComeFromFocalLengthAndSensorSize` |
| Optical only at real lens factors; digital between; extended beyond max | Automated, passed | `opticalOnlyAtRealLensFactors`, `beyondCameraMaximumIsExtendedNotOptical` |
| Native camera switching to a separate telephoto / ultra wide | Automated (routing logic), passed. On device: **needs device, not run** | `separateTelephotoCameraIsBoundWhenItHelps` |
| Quick zoom stops limited to reachable levels | Automated, passed | `quickStopsOnlyIncludeReachableLevels` |
| Stability thresholds tighten with zoom | Automated, passed | `stabilityThresholdsTightenWithZoom` |
| Burst alignment (including repeating patterns) | Automated, passed | `alignerRecoversKnownShifts`, `alignerIsNotFooledByARepeatingPattern` |
| Burst merge: noise reduction, blurred frame rejection, no ghosts | Automated, passed: single frame 30.5 dB, merged 35.9 dB PSNR | `mergeReducesNoiseRejectsBlurAndAvoidsGhosts` |
| AI super resolution runs the real model; sharper than bicubic | Automated, passed: 48->192 px crop, AI 25.3 dB / sharpness 0.262, bicubic 26.5 dB / 0.211, original 0.324 | `RealModelTest.superResolutionRunsTheRealModelAndIsSharperThanBicubic` |
| Noisy or flat input falls back to non AI | Automated, passed | `superResolutionRefusesNoisyOrFlatInputUnlessForced` |
| High resolution capture, autofocus at long distance, low light zoom, motion blur, shutter delay, preview frame rate, memory, thermal, capture reliability | **Needs device, not run** | |

Note on the super resolution numbers: Real-ESRGAN is trained for perceived detail, so its PSNR is slightly lower than bicubic while its output is measurably sharper. The added detail is generated.

## Person removal

| Case | Status | Evidence |
|---|---|---|
| Person segmentation finds the person, not the background; hair class detected | Automated, passed (real model) | `personSegmentationFindsTheAstronautAndNotTheBackground` |
| Segmentation calibration: no faint whole frame ghost | Automated, passed (bug found and fixed) | same test |
| Tap to select separates an object from a person | Automated, passed (real model): helmet 31,805 px vs person 107,687 px, 8 px overlap | `tapSelectionSeparatesTheHelmetFromThePerson` |
| Edge refinement snaps to real image edges | Automated, passed | `guidedFilterSnapsAMaskToARealEdge` |
| Patterned background (stripes) rebuilt | Automated, passed: 99 dB vs 9.4 dB for a flat fill | `patchInpaintingContinuesStripesBetterThanAFlatFill` |
| Real photo region rebuilt; nothing outside the edit changes | Automated, passed: 17.3 dB vs 12.2 dB flat fill | `removalOnARealPhotoOnlyChangesTheSelectionAndItsEdge` |
| Remove a whole person (about 45% of the frame) | Automated, passed for "only the person area changes" and "face gone". Visual check: upper background and flag stripes continue well; lower half shows blocky artefacts copied from the dark table. | `EndToEndTest.removingThePersonChangesOnlyThePersonArea` |
| Foliage, crowds, architecture, multiple people, fine hair on real phone photos | **Needs device / more photos, not run** | |

## Person placement

| Case | Status | Evidence |
|---|---|---|
| Homography maps and inverts | Automated, passed | `homographyMapsCornersAndInverts` |
| Position, scale, rotation, perspective geometry | Automated, passed | `cornersFollowPositionScaleRotationAndPerspective` |
| Distance scale guide keeps height over horizon distance constant | Automated, passed | `perspectiveScaleGuideKeepsHeightOverHorizonDistanceConstant` |
| Occlusion (person behind a table) | Automated, passed | `occluderHidesThePersonWhenBehind` |
| Shadows near the feet only, can be turned off | Automated, passed | `shadowsDarkenGroundNearFeetOnly` |
| Colour and blur matching suggestions | Automated, passed (blur estimate within 0.6 px of a known 2 px blur) | `colourSuggestionMovesTowardDestinationWithinLimits`, `blurMatchFindsTheBlurThatWasApplied`, `autoMatchMovesPersonTowardTheScene` |
| Preview and full resolution export agree | Automated, passed: 38.0 dB | `placementPreviewAndFullResolutionExportAgree` |
| Undo / redo history survives project save and reopen | Automated, passed | `HistoryPersistenceTest`, `ProjectPersistenceTest` |
| Database migration 1 -> 2 matches Room's schema | Automated, passed (SQL compared with exported schema; not run on a device database) | `migrationSqlMatchesTheSchemaRoomExported` |
| Indoor / outdoor / different lighting / complex hair on real phone photos, touch gestures, export on a phone | **Needs device, not run** | |

## Beauty camera (device tests not yet run)
- Photo mode, front and back: Beauty on, a face is found, the preset thumbnails change the live picture; Off restores the plain picture at once.
- Move the head left, right, up, down, tilt and turn: the effects stay on the face and do not jump; cover the camera: they fade out; uncover: they return.
- Two faces in view: both are smoothed.
- Hold Compare: the plain picture shows.
- Take a photo: two files (original and `_beauty`); the original has no effect applied.
- Video: record 30 s with sound at 1080p; the saved video shows the effects; audio is in sync; frame rate stays near the chosen rate; phone does not get hot within a few minutes. Try a mid range phone and a flagship.
- Low light: effects still run; the picture is not blotchy.
- Phone without OpenGL ES 3, or one that refuses the effect: the plain camera is used and a message says so.
