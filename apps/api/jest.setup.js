/**
 * Jest setup — apps/api
 *
 * CI-RESCUE 2026-06-06: en Node 16 (engine declarado package.json y CI),
 * `globalThis.crypto` no existe — fue agregado solo en Node 19+. Eso rompe:
 *
 *   - `subscription.service.ts` que llamaba `crypto.randomUUID()` bare
 *     (ya fixed con import explícito en src)
 *   - `@nestjs/schedule` SchedulerOrchestrator.addCron() — INTERNO de la lib,
 *     no podemos importarle desde dentro. Polyfill global es la única opción.
 *
 * Solución portable: asignar `crypto` Web Crypto API en globalThis si no existe.
 * Comportamiento idéntico a Node 19+ runtime productivo.
 */
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require('node:crypto')
  globalThis.crypto = webcrypto
}
