/**
 * Babel configuration for the Zenix mobile app.
 *
 * react-native-worklets/plugin MUST be the LAST plugin in the list.
 * Reason: it transforms `worklet`-tagged functions and other plugins
 * running after it produce ASTs the worklets compiler can't analyze.
 *
 * Note (Expo SDK 54 / Reanimated v4): the worklet plugin moved from
 * react-native-reanimated/plugin to react-native-worklets/plugin.
 * https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x
 */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Worklets plugin — MUST stay last.
      'react-native-worklets/plugin',
    ],
  }
}
