# KAAJ release shrinking rules.
#
# R8 removes unused code and resources. Everything below names a class that is
# only ever reached reflectively or from native code, so R8 cannot see the
# reference and would otherwise strip it.

# --- Flutter engine ---
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# --- Sentry: reads stack frames and option classes by name ---
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**
-keepattributes LineNumberTable,SourceFile
-keepattributes *Annotation*

# --- The one-shot location bridge is invoked over a MethodChannel ---
-keep class app.kaaj.mobile.MainActivity { *; }

# --- OkHttp / Conscrypt come in through plugin transitive deps ---
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Kotlin coroutines internals used reflectively ---
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
-dontwarn kotlinx.coroutines.**

# Keep the annotations Play Core / SplitCompat look for.
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**
