@file:Suppress("unused")
package android.content

import java.io.InputStream

/** Stands in for Android's Context: the engine only reads bundled font files from it. */
class Context {
    class Assets { fun open(name: String): InputStream = Context::class.java.classLoader.getResourceAsStream(name) ?: throw java.io.FileNotFoundException("Bundled file missing: $name") }
    val assets = Assets()
}
