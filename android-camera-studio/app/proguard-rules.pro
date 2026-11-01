# MediaPipe's image generator AAR ships no consumer rules. Its native code calls back into Java
# classes and protobuf messages by name, so keep them to avoid release only crashes.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**

# ONNX Runtime's native code looks up its Java classes (OrtException, OnnxJavaType, OnnxTensor and
# others) by name. If R8 renames them, the app closes the moment an AI model loads (Studio: remove or
# place a person, segmentation, AI upscaling). Keep the whole package.
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**
