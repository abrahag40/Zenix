/**
 * Metro bundler configuration for Zenix mobile in a monorepo workspace.
 *
 * Problem solved:
 *   Without this file, Metro's default resolver walks up from CWD looking
 *   for `package.json` and stops at the WORKSPACE ROOT (`housekeeping3/`),
 *   not the mobile package (`apps/mobile/`). It then tries to resolve
 *   `./index` relative to the workspace root and fails (404 + "Unable to
 *   resolve module ./index").
 *
 *   This is the canonical issue documented at:
 *   https://docs.expo.dev/guides/monorepos/
 *
 * What this config does:
 *   1. Pins `projectRoot` to `apps/mobile` so Metro treats this package
 *      as the entry point.
 *   2. Adds the workspace root to `watchFolders` so changes in
 *      `packages/shared/**` (Zenix shared types) trigger live reload.
 *   3. Tells the resolver to look at BOTH local + hoisted node_modules
 *      (npm workspaces hoist most deps to the workspace root).
 *   4. Disables hierarchical lookup so the resolver doesn't accidentally
 *      pull duplicates of React/RN from sibling packages.
 *
 * SDK 54 nuance:
 *   `getDefaultConfig` from `expo/metro-config` already wires expo-router,
 *   reanimated, and SVG transformers. We extend it rather than replace it.
 */

const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch the workspace root so changes in packages/shared trigger reload.
config.watchFolders = [workspaceRoot]

// 2. Look up modules in BOTH the local node_modules and the hoisted root.
//    Order matters: local first lets us override hoisted versions if needed.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// NOTE: We intentionally keep `disableHierarchicalLookup` at its default (false).
// In our setup, the npm `overrides` field at the workspace root already prevents
// duplicate React/RN versions, so we don't need the extra resolver restriction
// — and disabling it caused the bundler to hang resolving deep transitive deps
// like react-native-reanimated/scripts/validate-worklets-version → semver.

// ── Expo SDK 54 web: fix `import.meta` SyntaxError ───────────────────────
// Expo SDK 54 defaults to modern package-export resolution. Metro then
// hands ESM builds (which may use `import.meta`) directly to the web
// bundle — but the bundle is served via a classic `<script src="">`
// (no `type="module"`), so the browser throws a parse-time
// `SyntaxError: Cannot use 'import.meta' outside a module` BEFORE any
// code runs. Root stays empty; no `window.onerror` fires.
//
// Official workaround (Expo SDK 54): force Metro to prefer CommonJS
// exports of dependencies — the CJS build is pre-compiled and contains
// no `import.meta`. Becomes default in SDK 56.
//
// Sources:
//   - https://github.com/expo/expo/issues/36384
//   - https://github.com/expo/expo/issues/30323
//   - https://medium.com/@umairrx/solving-the-cannot-use-import-meta-outside-a-module-crash-in-expo-f56661249364
//
// After this change run `npx expo start -c` once to clear Metro cache.
config.resolver.unstable_conditionNames = [
  'browser',
  'require',
  'react-native',
]

module.exports = config
