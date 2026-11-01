# Architecture

Single `app` module, packages by feature. Manual dependency container in `app/App.kt` (`AppGraph`).

| Package | Responsibility |
|---|---|
| `photo.pipeline` | Pure Kotlin, Android free, unit tested. `ImageAnalyzer` (histogram, percentiles, clipping, Immerkaer noise estimate, neutral pixel colour cast), `EnhancementPlanner` (statistics + profile + strength + level -> `EnhancementParams`), `Enhancer` (banded: bilateral denoise -> linear light exposure / white balance / tone curve / saturation / vibrance -> thresholded, limited unsharp mask), `QualityValidator`, `ToneCurve`, `ColorMath`. |
| `photo.enhancement` | Android glue: `ImageLoader` (ImageDecoder, EXIF orientation applied, converted to sRGB), `BitmapPixels`, `EnhancePhoto` (decode, analyse, plan, enhance, validate, halve strength once if validation fails, refuse to save if it still fails, atomic MediaStore save, EXIF copy without location), `EnhanceWorker` (WorkManager, progress, cancellation), `ThermalGuard`. |
| `camera.engine` | CameraX: preview + ImageCapture (photo mode) or VideoCapture/Recorder (video mode). Real supported qualities, frame rates and stabilisation are read from `Recorder.getVideoCapabilities` and `CameraInfo`. |
| `camera.capabilities` | Camera2 `CameraCharacteristics` reader for the Device capabilities screen. |
| `camera` | `CameraScreen` UI. |
| `gallery` | MediaStore paged grid, viewer (zoom/pan, ExoPlayer for video), `CompareView` (slider or side by side, using the real original and processed files). |
| `editor.photo` | `EditParams` + versioned `EditParamsCodec`, `EditHistory` (undo/redo), `CropGeometry`, `PhotoEditorScreen` (preview pipeline at 1280 px, full resolution save in bands). |
| `editor.video` | `TrimConfig` validation, `VideoTrimScreen` (Media3 Transformer clipping, progress, cancel, integrity check). |
| `data.database` | Room: `MediaAsset` (original <-> processed link, status, notes, timing), `EditSession` (saved edit parameters). Schema exported to `app/schemas`. |
| `data.preferences` | DataStore user preferences. |
| `core.*` | Design tokens and shared components, structured `AppError` + `ErrorMapper`, `JobState`, MediaStore repository, permission gate. |

## Key decisions
- **Three separate pipelines**: the live preview is the untouched CameraX preview (no effects are faked on it); post capture enhancement runs in WorkManager; the editor preview runs the same `Enhancer` on a 1280 px copy, and saving runs it at full resolution.
- **Banding**: images are processed in bands of about 1 million pixels with halo rows, so peak memory is the source and destination bitmaps plus small buffers. A unit test proves banded output equals whole image output bit for bit.
- **Linear light**: exposure, white balance, tone and saturation are computed on linear RGB. Tone is a luminance gain, which keeps hue.
- **Originals are never modified**. Every result is a new MediaStore item written with `IS_PENDING` so partial files are never visible.
- **No network permission**.
