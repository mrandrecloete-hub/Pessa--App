/**
 * Wraps app.json. Plain http:// is blocked on Android by default, which is what we want for real builds.
 * For a LOCAL dev build that talks to the local Supabase stack, start with MONEVA_LOCAL=1 to allow it.
 * Never build a release with MONEVA_LOCAL set.
 */
module.exports = ({ config }) => {
  const local = process.env.MONEVA_LOCAL === '1';
  if (process.env.EAS_BUILD_PROFILE === 'production' && local) throw new Error('MONEVA_LOCAL must not be set for a production build.');
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: local } }]],
  };
};
