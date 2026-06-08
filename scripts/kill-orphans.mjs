#!/usr/bin/env node
/**
 * kill-orphans — mata procesos huérfanos del entorno de desarrollo Zenix.
 *
 * Problema repetido (CLAUDE.md owner feedback 2026-06-07, 2026-06-08):
 * cuando una terminal/sesión muere abruptamente, los procesos `nest start`,
 * `nodemon`, `vite` quedan bindeando :3000 y :5173. Al reabrir y ejecutar
 * `npm run dev` el nuevo turbo arranca pero los puertos están ocupados —
 * vite recupera otro puerto, API queda con el bundle viejo (sin watch del
 * código actual), y el dashboard arroja ECONNREFUSED en cascada.
 *
 * Solución: este script corre como `predev` (hook automático de npm) ANTES
 * de cada `npm run dev`. Mata huérfanos por nombre de proceso conocido en
 * macOS/Linux, libera puertos 3000 y 5173, y reporta lo que mató.
 *
 * No usa dependencias externas. Falla suave: si nada que matar, exit 0.
 */
import { execSync } from 'node:child_process'

const PROCESS_PATTERNS = [
  'nest start',
  'nodemon --watch',
  'ts-node.*src/main.ts',
  'vite$',           // exacto: no matchea vite.config etc.
  'apps/web.*vite',
]
const PORTS = [3000, 5173]

function quietExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function killByPattern(pattern) {
  const pids = quietExec(`pgrep -f '${pattern.replace(/'/g, "'\\''")}'`)
    .split('\n')
    .filter(Boolean)
    .filter((pid) => Number(pid) !== process.pid)
  if (pids.length === 0) return []
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM') } catch { /* ignore */ }
  }
  return pids
}

function killByPort(port) {
  const pids = quietExec(`lsof -ti :${port}`).split('\n').filter(Boolean)
  if (pids.length === 0) return []
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM') } catch { /* ignore */ }
  }
  return pids
}

const killed = new Set()
for (const p of PROCESS_PATTERNS) {
  for (const pid of killByPattern(p)) killed.add(pid)
}
// Give SIGTERM a moment, then port-scan + SIGKILL stubborn ones
await new Promise((r) => setTimeout(r, 300))
for (const port of PORTS) {
  for (const pid of killByPort(port)) killed.add(pid)
}

if (killed.size > 0) {
  // eslint-disable-next-line no-console
  console.log(`\x1b[33m[kill-orphans]\x1b[0m liberé ${killed.size} proceso${killed.size === 1 ? '' : 's'} huérfanos (${[...killed].join(', ')})`)
} else {
  // eslint-disable-next-line no-console
  console.log('\x1b[32m[kill-orphans]\x1b[0m sin huérfanos, puertos limpios')
}
