const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Wraps app.json. Plain http:// is blocked on Android by default, which is what we want for real builds.
 * For a LOCAL dev build that talks to the local Supabase stack, start with MONEVA_LOCAL=1 to allow it.
 * Never build a release with MONEVA_LOCAL set.
 */

// The ML Kit document scanner module sets its Kotlin target with an old setting that current Kotlin ignores,
// so Kotlin compiles for 21 while Java compiles for 17 and Gradle stops. Pin that module's Kotlin to 17.
const PIN_MARKER = '// moneva: pin kotlin jvm target v2';
const pinScannerKotlinTarget = (config) =>
  withProjectBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(PIN_MARKER)) {
      c.modResults.contents += `
${PIN_MARKER}
subprojects { p ->
  if (p.name == 'infinitered-react-native-mlkit-document-scanner') {
    // The module loads its own copy of the Kotlin plugin, so match tasks by name and use the task's own classes.
    p.tasks.matching { it.name.startsWith('compile') && it.name.endsWith('Kotlin') }.configureEach { t ->
      def target = t.compilerOptions.jvmTarget
      target.set(target.get().getClass().fromTarget('17'))
    }
  }
}
`;
    }
    return c;
  });

module.exports = ({ config }) => {
  const local = process.env.MONEVA_LOCAL === '1';
  if (process.env.EAS_BUILD_PROFILE === 'production' && local) throw new Error('MONEVA_LOCAL must not be set for a production build.');
  return pinScannerKotlinTarget({
    ...config,
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: local } }]],
  });
};
