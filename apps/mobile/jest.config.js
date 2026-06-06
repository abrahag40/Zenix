/**
 * jest.config.js — Sprint QA-α mobile (2026-06-06).
 *
 * Reemplaza la sección "jest" del package.json para tener control de
 * setupFiles. El preset jest-expo PUSHEA su setup.js al final del array;
 * sin override, el setup del preset corre antes que el mío y falla
 * con "FormData is not defined" (Node 16/18 sin native FormData).
 *
 * Fix: usar setupFiles array explícito con [polyfill, preset-setup, ...]
 * para que el polyfill aplique ANTES del preset que asume FormData global.
 */
const jestExpoPreset = require('jest-expo/jest-preset')

// El preset agrega su setup.js automáticamente — lo extraemos para
// reinsertarlo DESPUÉS de nuestro polyfill.
const presetSetupFiles = jestExpoPreset.setupFiles ?? []

module.exports = {
  ...jestExpoPreset,
  setupFiles: [
    // 1. POLYFILL primero — provee FormData/Blob/File globals
    '<rootDir>/jest.setup.js',
    // 2. Setup del preset (que asume FormData disponible)
    ...presetSetupFiles,
  ],
}
