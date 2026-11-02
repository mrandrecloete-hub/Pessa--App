# Feature status

## BlazeCam upgrade (2026-11-01, in progress: emulator testing not finished)
### Video quality (0.2.7)
All video recording now asks the encoder for about double CameraX's default bitrate: 24 Mbps at 1080p, 50 Mbps at 4K, 12 Mbps at 720p, more at 50 or 60 fps (`camera/engine/VideoBitrates.kt`, unit tested). The phone's encoder may still limit it. Not yet compared on a phone.

### Beauty camera (live, Photo and Video modes)
**Verified**: face tracking (real models, real face photo, JVM tests); colour presets and settings (unit tests); the GPU renderer itself, run through the photo path on the Android emulator's software GL (6 tests: every effect, all 12 presets, GPU colour equals the Kotlin reference, nothing outside the face changes); screenshots reviewed by eye.
**Not verified (no working device or emulator was available for it)**: the live camera preview with the effect (CameraX effect path), video recording with the effect, frame rate, audio sync, heat and battery, and behaviour on real phones (mid range or flagship). Treat live preview and video as untested until you try them on a phone. Beauty is off until the user turns it on. A crash guard switches it off again by itself if the app closed while it was running.
- **Face tracking**: Google MediaPipe BlazeFace (finds faces) and Face Mesh (468 points), converted to ONNX and run by ONNX Runtime on a background thread (`camera/beauty/FaceTracker.kt`). Follows up to 3 faces, smooths the points (One Euro filter), fades effects out in about 5 frames when a face leaves and picks it up again; works in all four phone orientations and corrects a wrong orientation hint by itself. 4 tests on a real face photo (rotated, flipped, two faces, lost and found again).
- **Effects on the GPU** (OpenGL ES 3, `camera/beauty/gl/`): skin smoothing (edge preserving, only removes small differences so folds and shadows stay, keeps part of the skin texture), blemish reduction, under eye lift, skin tone evening, skin brightness, face lighting, eye detail and whites, teeth whitening, optional lip colour (5 tints), blush, contour and highlight, optional jawline refinement (off in every preset, at most 3.5 percent of face size, lower jaw sides only). Each has its own slider and can be set to Off. Eye size, nose, face shape and skin colour are never changed.
- **12 presets** with real colour grades (Natural Beauty, Glass Skin, Soft Glam, Golden Hour, Studio Portrait, Clean Girl, Cinematic, Luxury Portrait, Warm Glow, Cool Tone, Vintage Film, Original). Tests: every preset except Original changes the picture, no two are alike, and the GPU colour matches the Kotlin reference within 3 of 255.
- **Controls**: Beauty button on the camera, switch for Beauty, preset carousel with live thumbnails, master intensity, per-effect sliders, Makeup tab, Filter strength, hold to compare with the original, reset, and a one tap chip to turn every effect off.
- **Photo**: the photo is saved untouched; a separate `_beauty` copy is made with the same renderer (up to 4096 px on the long side). If the copy fails the original is kept.
- **Video** (designed, untested): the effect is applied to the frames the encoder receives, so the saved video should match the preview. With Beauty on, recording starts at 1080p unless you choose 4K (4K with Beauty needs a fast phone; untested). Audio is recorded by CameraX as before. Not yet measured for frame rate or audio sync on a phone.
- **Limits**: phones that do not offer OpenGL ES 3 or refuse the effect fall back to the plain camera and say so. If the phone cannot keep up, quality steps down by itself. Beauty replaces the older colour filters and HDR while it is on in Photo mode. Not available in Portrait, Night, Pro or Zoom modes. No tracking of faces in low light below what the face model can see.

Fixed in 0.2.5: release builds closed when Studio AI features loaded a model (R8 removed ONNX Runtime classes); verified on the emulator with a release build.

In-app updates download only the changes (patch, usually under 1 MB) and install automatically in the background on Android 12+ (see RELEASING.md); patch rebuild tested against the real 0.2.0 and 0.2.1 APKs.

Built and unit tested, not yet verified on the emulator or a phone: BlazeCam name and stand-alone icon (crown, frame and lettering removed from the supplied artwork), black / royal blue / gold design, startup logo reveal, camera modes Night, Portrait, Photo, Video, Pro, Zoom; HDR (phone extension or 3-exposure fusion), Night (phone extension or 5-frame merge), Portrait (face finding, subject focus, background blur, 5 lighting looks, or phone bokeh extension), Pro (ISO, shutter, EV, white balance, manual focus, RAW+DNG, histogram, only where supported), photo resolution, AI toggle, gallery thumbnail, shutter / focus / mode animations, video pause and resume; 10 filters with live preview (Android 12+) and intensity in camera and editor; gallery favourites, albums, recycle bin with restore (Android 11+); settings for resolution, video quality, timer, shutter sound, watermark, save location, storage and permissions. CameraX 1.5.1. 92 unit tests pass, lint 0 errors.


Legend: Done = implemented and compiles, logic unit tested where marked. "Not run on a device" applies to everything: no device or emulator was available.

## Done
- Camera preview, photo capture to MediaStore, video recording with audio (or without, if microphone is denied)
- Front/back switching, pinch zoom and zoom stops limited to the reported zoom range (not labelled optical), tap to focus and meter, exposure compensation (only when supported), flash modes / torch (only if a flash exists), 3 s and 10 s timer, grid, 4:3 and 16:9
- Video: quality choices from `getSupportedQualities`, 24/30/60 fps only if a reported range contains it (labelled as requested), stabilisation only if supported, recording timer, recorded size, remaining space estimate from the actual bitrate, error mapping on finalize
- Permission flow with explanation, settings shortcut, re-check on resume
- Automatic enhancement after capture (WorkManager, real progress, cancel), six profiles, strength, Quick / Balanced / Maximum, thermal and battery saver adjustment, validation with honest notes (unit tested)
- Gallery: paging, thumbnails via `loadThumbnail`, search, filters, sort, multi select, share, delete with confirmation, details
- Before and after: slider and side by side, pinch zoom and pan, dimensions and size of both files
- Photo editor: 12 adjustments, rotate, flip, aspect crops, hold to compare, undo/redo/reset, save as new photo at full resolution with progress and cancel, edit settings saved per photo in Room and restored on reopen (codec unit tested)
- Video trim: range slider over real frame thumbnails, preview playback of the selection, remove sound, Media3 Transformer export with progress and cancel, temp file cleanup, integrity check
- Settings, Device capabilities (Camera2), Privacy, and "What works" pages
- Structured errors that say what happened, what to do, whether the original is safe and whether retry helps (unit tested)

- AI image studio (Studio > Create an image):
  - Online: OpenAI Images API (`/v1/images/generations`, default model `gpt-image-1`, editable), user's own key encrypted with Android Keystore, consent dialog before first use, sizes 1024x1024 / 1536x1024 / 1024x1536, quality, 1 to 4 images, elapsed time shown (no fake progress), cancel disconnects the request. Request and response handling unit tested with a fake transport. **Not tested against the real API** (no key in the build environment).
  - On device: MediaPipe Image Generator 0.10.26.1 (Stable Diffusion 1.5 weights converted by MediaPipe's script, imported by the user from a folder, about 2 GB, not bundled). Real per step progress and cancel between steps. arm64-v8a only. **Not run** (no ARM device available).
  - Results are saved as `_gen` JPEGs with EXIF Software and ImageDescription marking them AI generated; gallery filter "AI generated".

- **Ultra zoom (camera ZOOM mode)**: lens catalogue from Camera2 (focal length, sensor size, logical and separate cameras); zoom planner labels every level optical, digital or extended from real lens data and never calls digital optical; automatic binding of a separate telephoto / ultra wide camera after the user pauses; log slider, quick stops limited to reachable levels, pinch zoom; preview enlargement for extended levels (labelled); gyroscope steadiness indicator and wait-for-steady capture at 5x and beyond; focus lock, exposure lock (Camera2 interop), manual focus where the camera reports manual sensor support; 1, 3 or 5 full resolution frames captured to cache files and processed by `UltraZoomWorker` (region decoding, burst merge with blur rejection, alignment, ghost rejection, gentle correction, AI or standard upscaling, honest notes); the untouched reference frame is saved as the original and linked for before and after.
- **AI super resolution**: Real-ESRGAN General x4v3 bundled (BSD-3-Clause), ONNX Runtime with XNNPACK when available, tiled, 2x/3x/4x, strength, blur/noise gating with a non AI fallback.
- **AI Composite Studio** (Studio > Open Composite Studio):
  - Remove a person: automatic people finding (MediaPipe multiclass segmentation, Apache 2.0), tap to select (MediaPipe MagicTouch, Apache 2.0), brush add / erase, refine edges (guided filter, hair aware), expand, zoom and pan while editing, mask undo/redo, preview, hold to compare, full resolution save from the untouched original, saved projects.
  - Place a person: cut out with the same tools and a transparent preview; drag, pinch resize, twist rotate, flip, perspective, lean, opacity, layer order; distance scale guide with horizon; auto match (brightness, contrast, colour temperature, focus blur) with manual sliders; contact and cast shadows with direction, length, softness and a scene estimate; foreground occlusion by tap or brush; undo/redo with history saved in the project; full resolution export (scene capped at 16 MP).
- Projects reopen from the Composite Studio list or from the result in the gallery (Edit removal / Edit composite).

## Partial
- Zoom on hardware: all camera behaviour is untested on a device. Whether a phone switches lenses inside its logical camera is decided by the phone.
- Multi-frame merge is translation only (no rotation); merging is done at half resolution when the zoom region exceeds 3 MP.
- AI super resolution input is limited to 4 MP and output to 24 MP; large inputs fall back to standard upscaling.
- Removal quality depends on how much background is visible; large removals show artefacts (see QA_TEST_PLAN.md).
- Light direction estimate is a rough left/right brightness comparison with a confidence value.

## Not started (not shown in the app)
AI inpainting model, automatic depth estimation, automatic ground plane / horizon detection,
AI enhancement models (neural denoise, super resolution, segmentation, inpainting), prompt based editing of existing photos, image to image, face aware processing, Pro manual ISO/shutter/focus, histogram, focus peaking, RAW, Night and HDR multi frame, Burst, Document, Macro, Portrait blur, slow motion, timelapse, HDR/HEVC video options, automatic video enhancement, multi clip timeline, text, music, transitions, curves, HSL, vignette, grain, filters, straighten, perspective, albums, favourites, instrumentation tests.
