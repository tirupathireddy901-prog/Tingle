# WebRTC's JNI layer calls into these classes by name/signature — R8
# stripping or renaming them breaks native calls silently at runtime
# rather than at compile time, so keep the whole package.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Moshi's reflection-based adapter (KotlinJsonAdapterFactory, used in
# ApiClient.kt) needs Kotlin metadata and the data classes' structure
# intact to serialize/deserialize correctly.
-keep class com.tingle.app.data.models.** { *; }
-keep @com.squareup.moshi.JsonClass class * { *; }
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.Metadata

# Retrofit uses reflection on interface methods/annotations at runtime.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keep interface com.tingle.app.data.TingleApi { *; }
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**

# Standard Android/Kotlin coroutines keep rules.
-dontwarn kotlinx.coroutines.**
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
