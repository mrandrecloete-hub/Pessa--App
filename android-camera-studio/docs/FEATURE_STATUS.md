# Feature status

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

## Not started (not shown in the app)
AI enhancement models (neural denoise, super resolution, segmentation, inpainting), prompt based editing of existing photos, image to image, face aware processing, Pro manual ISO/shutter/focus, histogram, focus peaking, RAW, Night and HDR multi frame, Burst, Document, Macro, Portrait blur, slow motion, timelapse, HDR/HEVC video options, automatic video enhancement, multi clip timeline, text, music, transitions, curves, HSL, vignette, grain, filters, straighten, perspective, albums, favourites, instrumentation tests.
