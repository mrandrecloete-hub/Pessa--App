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

## Not started (not shown in the app)
AI models of any kind (neural denoise, super resolution, segmentation, inpainting), AI image generation, face aware processing, Pro manual ISO/shutter/focus, histogram, focus peaking, RAW, Night and HDR multi frame, Burst, Document, Macro, Portrait blur, slow motion, timelapse, HDR/HEVC video options, automatic video enhancement, multi clip timeline, text, music, transitions, curves, HSL, vignette, grain, filters, straighten, perspective, albums, favourites, instrumentation tests.
