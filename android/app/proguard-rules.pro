# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Drop noisy annotation and metadata classes that are not needed at runtime.
-dontnote kotlin.**
-dontnote org.jetbrains.annotations.**
-dontwarn kotlin.**

# Some bundled annotation-processing helpers reference javax.lang.model APIs that
# are only present in compiler environments, not on Android runtime classpaths.
# These references are not used at runtime, so suppress their R8 missing-class warnings.
-dontwarn javax.lang.model.**
