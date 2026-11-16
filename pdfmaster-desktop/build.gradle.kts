import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
    id("org.jetbrains.compose") version "1.7.3"
}

val appVersion: String = (project.findProperty("desktopVersion") as String?) ?: file("VERSION").readText().trim()
group = "com.pdfmaster"
version = appVersion

java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

// The document engine (PDF tools, converters, restoration) is the same source as the Android app's.
// It is copied at build time, with the PDFBox package name changed from the Android port to the desktop original.
// Only Pdfx.kt differs: src/main/kotlin/engine/Pdfx.kt is the Windows version.
val engineOut = layout.buildDirectory.dir("generated/engine")
val syncEngine by tasks.registering(Sync::class) {
    from("../pdfmaster/app/src/main/java/com/pdfmaster/app/engine") {
        exclude("Pdfx.kt")
        filter { it.replace("com.tom_roush.pdfbox", "org.apache.pdfbox") }
    }
    into(engineOut.map { it.dir("com/pdfmaster/app/engine") })
}
sourceSets { main { kotlin.srcDir(engineOut) } }
tasks.matching { it.name.startsWith("compileKotlin") || it.name == "kspKotlin" }.configureEach { dependsOn(syncEngine) }
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach { dependsOn(syncEngine) }

// The app reads its own version from a file made at build time (also used by the updater).
val versionRes = layout.buildDirectory.dir("generated/version")
val writeVersion by tasks.registering { val out = versionRes; val v = appVersion; outputs.dir(out); doLast { out.get().asFile.mkdirs(); out.get().file("version.txt").asFile.writeText(v) } }
sourceSets { main { resources.srcDir(versionRes) } }
tasks.named("processResources") { dependsOn(writeVersion) }

// Same sample documents as the Android tests.
sourceSets { test { resources.srcDir("../pdfmaster/app/src/test/resources") } }

// ---- Smaller installer ----
// -PslimPackage: keep only the Material icons this app uses (the full pack is 38 MB of thousands of icons).
// -PwindowsOnly: keep only the 64-bit Windows OpenCV library (the OpenCV jar carries native code for every system, 110 MB).
val slim = providers.gradleProperty("slimPackage").isPresent
val windowsOnly = providers.gradleProperty("windowsOnly").isPresent
val slimSources by configurations.creating { isCanBeConsumed = false; isTransitive = false }
val openpnp by configurations.creating { isCanBeConsumed = false; isTransitive = false }
dependencies { slimSources("org.jetbrains.compose.material:material-icons-extended-desktop:1.7.3"); openpnp("org.openpnp:opencv:4.9.0-0") }
val usedIcons: Set<String> by lazy {
    val re = Regex("Icons\\.Outlined\\.([A-Za-z0-9]+)")
    fileTree("src/main/kotlin").matching { include("**/*.kt") }.files.flatMap { re.findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }.toSet()
}
val slimIcons = tasks.register<Jar>("slimIcons") {
    archiveBaseName.set("material-icons-used"); destinationDirectory.set(layout.buildDirectory.dir("slim"))
    from({ zipTree(slimSources.files.first { it.name.startsWith("material-icons-extended") }) }) {
        val keep = usedIcons; val base = "androidx/compose/material/icons/"
        eachFile { val n = this.path
            if (n.startsWith(base) && n.endsWith(".class")) { val m = Regex("""androidx/compose/material/icons/outlined/([A-Za-z0-9]+)Kt(\$.*)?\.class""").matchEntire(n); if (m == null || m.groupValues[1] !in keep) exclude() } }
    }
}
val opencvWindows = tasks.register<Jar>("opencvWindows") {
    archiveBaseName.set("opencv-windows"); destinationDirectory.set(layout.buildDirectory.dir("slim"))
    from({ zipTree(openpnp.singleFile) }) { exclude("nu/pattern/opencv/linux/**", "nu/pattern/opencv/osx/**", "nu/pattern/opencv/windows/x86_32/**") }
}

dependencies {
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    if (slim) implementation(files(slimIcons)) else implementation(compose.materialIconsExtended)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.9.0")
    implementation("org.apache.pdfbox:pdfbox:2.0.31")
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    implementation("org.bouncycastle:bcpkix-jdk18on:1.78.1")
    if (windowsOnly) implementation(files(opencvWindows)) else implementation("org.openpnp:opencv:4.9.0-0")   // desktop OpenCV with native code for Windows, macOS and Linux
    implementation("org.json:json:20250517")
    implementation("com.drewnoakes:metadata-extractor:2.19.0")   // reads the photo orientation (EXIF)
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
    testImplementation(compose.desktop.uiTestJUnit4)
    testImplementation(compose.desktop.currentOs)
}

tasks.test { useJUnit(); maxHeapSize = "3g"; systemProperty("java.awt.headless", "true") }

compose.desktop {
    application {
        mainClass = "com.pdfmaster.desktop.MainKt"
        jvmArgs += listOf("-Xmx2g")
        nativeDistributions {
            targetFormats(TargetFormat.Msi, TargetFormat.Exe)
            packageName = "PDFMASTER"
            packageVersion = appVersion
            description = "PDF editor, converter and document restoration"
            vendor = "PDFMASTER"
            modules("java.sql", "jdk.unsupported")
            windows {
                menuGroup = "PDFMASTER"
                shortcut = true
                dirChooser = true
                perUserInstall = true
                // Never change this: it is how Windows knows a new installer is an update of the installed app.
                upgradeUuid = "6f1c2a6e-3b6d-4b0e-9d52-4a5f6e0b7c11"
                iconFile.set(project.file("src/main/resources/icon.ico"))
            }
        }
    }
}
