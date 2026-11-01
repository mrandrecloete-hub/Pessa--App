# MediaPipe's image generator AAR ships no consumer rules. Its native code calls back into Java
# classes and protobuf messages by name, so keep them to avoid release only crashes.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**
