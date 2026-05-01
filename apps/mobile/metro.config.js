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

module.exports = config
