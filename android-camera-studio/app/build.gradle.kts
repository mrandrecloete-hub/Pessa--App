plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

// Release version: passed by the GitHub release workflow (-PblazecamVersion=1.2.3); local builds use the default.
val blazecamVersion: String = (findProperty("blazecamVersion") as String?) ?: "0.2.0"
val blazecamVersionCode: Int = blazecamVersion.split(".").map { it.toInt() }.let { (it.getOrElse(0) { 0 } * 10000) + (it.getOrElse(1) { 0 } * 100) + it.getOrElse(2) { 0 } }

android {
    namespace = "com.example.aicamerastudio"
    compileSdk = 35

    defaultConfig {
        // Permanent app ID. Never change it after release: a new ID installs as a different app.
        applicationId = "com.blazecam.app"
        // API 29: scoped storage is the baseline, so the app needs no broad storage permission.
        minSdk = 29
        targetSdk = 35
        versionCode = blazecamVersionCode
        versionName = blazecamVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // One APK per CPU type for side loading. (An App Bundle, ./gradlew bundleRelease, splits automatically on Google Play.)
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = false
        }
    }

    // Release signing comes only from environment variables set by the GitHub workflow from encrypted
    // repository secrets. No key or password is stored in this project.
    val ksFile = System.getenv("BLAZECAM_KEYSTORE_FILE")
    signingConfigs {
        if (ksFile != null && file(ksFile).exists()) create("release") {
            storeFile = file(ksFile)
            storePassword = System.getenv("BLAZECAM_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("BLAZECAM_KEY_ALIAS")
            keyPassword = System.getenv("BLAZECAM_KEY_PASSWORD")
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
    }
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
        // Compress native libraries in the APK (smaller download; extracted once at install).
        jniLibs.useLegacyPackaging = true
        // 32 bit x86 is effectively unused by phones; x86_64 stays for emulators.
        jniLibs.excludes += "lib/x86/**"
    }
    androidResources { noCompress += "onnx" }
}

// The Android ONNX Runtime cannot load on a desktop JVM; unit tests use the desktop build instead.
configurations.matching { it.name.contains("UnitTest", ignoreCase = true) }.configureEach {
    exclude(group = "com.microsoft.onnxruntime", module = "onnxruntime-android")
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.video)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.camera.extensions)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    implementation(libs.androidx.media3.transformer)
    implementation(libs.androidx.media3.effect)
    implementation(libs.androidx.media3.common)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.mediapipe.image.generator)
    implementation(libs.androidx.documentfile)
    // On-device AI inference (super resolution, person segmentation, tap to select).
    implementation(libs.onnxruntime.android)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    // Android ships org.json; unit tests on the JVM need the real implementation.
    testImplementation(libs.org.json)
    // Desktop ONNX Runtime, so unit tests run the real bundled models on the JVM.
    testImplementation(libs.onnxruntime.jvm)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
