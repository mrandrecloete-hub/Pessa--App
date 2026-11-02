#!/bin/sh
# Reproduces app/src/main/assets/models/{selfie_multiclass_256x256,magic_touch}.onnx
# Needs: python -m pip install tensorflow-cpu tf2onnx   (tested with TF 2.21.0, tf2onnx 1.17.0)
set -e
B=https://storage.googleapis.com/mediapipe-models
curl -sLO $B/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
curl -sLO $B/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite
python -m tf2onnx.convert --tflite selfie_multiclass_256x256.tflite --output selfie_multiclass_256x256.onnx --opset 17
python -m tf2onnx.convert --tflite magic_touch.tflite --output magic_touch.onnx --opset 17

# Beauty camera face tracking (MediaPipe, Apache 2.0):
#   https://storage.googleapis.com/mediapipe-assets/face_detection_short_range.tflite
#   https://storage.googleapis.com/mediapipe-assets/face_landmark.tflite
python -m tf2onnx.convert --tflite face_detection_short_range.tflite --output face_detection_short_range.onnx --opset 17
python -m tf2onnx.convert --tflite face_landmark.tflite --output face_landmark.onnx --opset 17
