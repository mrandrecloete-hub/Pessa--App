import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Release signing is read from keystore.properties (kept out of git) or from environment variables.
// Nothing secret is stored in this file. See README.md > Release signing.
val ksProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    (ksProps.getProperty(key) ?: System.getenv(env))?.takeIf { it.isNotBlank() }

android {
    namespace = "com.pdfmaster.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pdfmaster.app"
        minSdk = 26
        targetSdk = 35
        // CI passes -PpdfmasterVersion=1.2.3. The version code is made from it, so it always rises with the version.
        val ver = (project.findProperty("pdfmasterVersion") as String?) ?: "0.1.0"
        val parts = ver.split(".").map { it.toIntOrNull() ?: 0 } + listOf(0, 0, 0)
        versionName = ver
        versionCode = maxOf(1, parts[0] * 10000 + parts[1] * 100 + parts[2])
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Real phones and tablets. Leaving out x86 (emulators) keeps the download about 20 MB smaller.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    signingConfigs {
        val storePath = signingValue("storeFile", "PDFMASTER_KEYSTORE_FILE")
        if (storePath != null) {
            create("release") {
                storeFile = file(storePath)
                storePassword = signingValue("storePassword", "PDFMASTER_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "PDFMASTER_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "PDFMASTER_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Code shrinking is off on purpose until the release build can be tested on real devices with it on.
            isMinifyEnabled = false
            isShrinkResources = false
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
    packaging {
        resources.excludes += setOf("META-INF/{AL2.0,LGPL2.1}", "META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*",
            // Tables for post-quantum algorithms in the crypto library that PDF encryption never uses.
            "org/bouncycastle/pqc/**", "org/bouncycastle/x509/**")
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { it.maxHeapSize = "2g" }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
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
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)
    ksp(libs.hilt.androidx.compiler)
    implementation(libs.pdfbox.android)
    implementation(libs.mlkit.text)
    implementation(libs.mlkit.scanner)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
