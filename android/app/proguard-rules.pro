# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Capacitor classes and JavaScript interfaces
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}

# Preserve Capacitor BridgeActivity and Bridge
-keep class com.getcapacitor.BridgeActivity { *; }
-keep class com.getcapacitor.Bridge { *; }

# Keep Driver App custom classes, services, receivers, and plugins
-keep class com.kmt.driver.** { *; }

# Google Play Services Location
-keep class com.google.android.gms.location.** { *; }
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.**

# Firebase Database & Firestore
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Capacitor Plugins
-keep class com.capacitorjs.plugins.** { *; }

# Keep line numbers and file names for crash reporting
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
