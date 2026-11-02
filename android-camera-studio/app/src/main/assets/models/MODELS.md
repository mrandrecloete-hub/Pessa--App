# Bundled AI models

| File | What it does | Source | Licence | SHA-256 |
|---|---|---|---|---|
| realesr_general_x4v3.onnx | 4x super resolution (Real-ESRGAN General x4v3, SRVGGNetCompact) | Weights `realesr-general-x4v3.pth` from github.com/xinntao/Real-ESRGAN release v0.2.5.0 (sha256 8dc7edb9…6292), exported with `tools/export_realesrgan_onnx.py` (PyTorch 2.15 CPU, opset 17). ONNX output matched PyTorch within 1e-6. | BSD-3-Clause, Copyright (c) 2021 Xintao Wang. See LICENSE-Real-ESRGAN-BSD-3-Clause.txt | 3439a9e4cd26c4cdfff28f82f00411a7a4f06e7f72a1efdc664479f1e2bf0690 |
| selfie_multiclass_256x256.onnx | Person segmentation, 6 classes: background, hair, body skin, face skin, clothes, accessories | Google MediaPipe `selfie_multiclass_256x256.tflite` (float32), converted with `tools/convert_mediapipe_onnx.sh`. Output matched TFLite within 2e-5. | Apache License 2.0 (Google model card "Multiclass Segmentation"). See LICENSE-Apache-2.0.txt | 3e9ca42a52d28c6d7eb0b5bd9252fa7139db5601ca872ba89741ac0845fe7e60 |
| magic_touch.onnx | Tap to select: RGB + tapped point channel -> object mask | Google MediaPipe `magic_touch.tflite` (interactive segmenter, float32), converted the same way. Output matched TFLite within 1e-5. | Apache License 2.0 (Google model card "MagicTouch"). See LICENSE-Apache-2.0.txt | 94700d86976db541ce7b49542c7b3612653b35808795222e26a6f18ca5db5692 |
| face_detection_short_range.onnx | Face finding for the beauty camera (BlazeFace short range, 128x128 input, 896 anchors) | Google MediaPipe `face_detection_short_range.tflite`, converted with `tools/convert_mediapipe_onnx.sh`. Output matched TFLite within 4e-5. | Apache License 2.0 (MediaPipe). See LICENSE-Apache-2.0.txt | 88882dfa847d37cf63dca58702a3af08d3b9680320a794c8e78bb81073747fc2 |
| face_landmark.onnx | 468 point face mesh for the beauty camera (192x192 face crop) | Google MediaPipe `face_landmark.tflite`, converted the same way. Output matched TFLite within 1.3e-4. | Apache License 2.0 (MediaPipe). See LICENSE-Apache-2.0.txt | 1153aa4339372f1fc28dca2f50733f39d4403a0c6583668115eb69738a68d990 |

Model card notes: both MediaPipe models are intended for entertainment and creative uses, not for life critical decisions.
Super resolution output is generated detail, not recovered sensor information.

The two face models run only on this phone, on a small copy of each camera frame. They keep no data between frames beyond the current face points, which are never written to storage.
