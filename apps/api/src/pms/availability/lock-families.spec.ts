// Guardián estructural: TODO cerrojo de inventario usa la MISMA familia de claves.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
// `pg_advisory_xact_lock` sólo serializa transacciones que piden la MISMA clave.
// Dos familias distintas no se bloquean entre sí — y eso no lo detecta ninguna
// prueba funcional, porque cada flujo pasa el suyo en verde.
//
// Pasó: hasta el 2026-09-22 el motor público de reservas tomaba
// `booking:<propertyId>` mientras recepción y Channex tomaban `walk-in:<roomId>`.
// El único camino abierto a internet era el que NO se serializaba con el
// mostrador. La regla ya estaba escrita en prosa —«misma key en TODOS los
// flujos»— y una regla sin gate no se sostiene.
//
// ── POR QUÉ ESTRUCTURAL Y NO FUNCIONAL ──────────────────────────────────────
// Es barato, determinista, no necesita base de datos y corre en cada CI. La
// prueba de concurrencia real (`test/overbooking-web-vs-frontdesk.e2e-spec.ts`)
// demuestra el comportamiento; ésta impide que vuelva a divergir.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')

/**
 * Claves que NO son de inventario y por eso se permiten fuera de `walk-in:`.
 * Cada excepción lleva su motivo. Añadir una sin motivo es el camino por el que
 * vuelve a entrar el defecto que esta prueba existe para impedir.
 */
const EXCEPCIONES: ReadonlyArray<{ clave: string; motivo: string }> = [
  {
    clave: 'booking:${property.id}',
    motivo:
      'Protege el CONTADOR del bookingRef de la property, no el inventario. ' +
      'El mismo flujo toma además walk-in:${room.id} por cada habitación candidata, ' +
      'que es lo que lo serializa contra recepción y contra las OTAs.',
  },
]

function archivosTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const r = join(dir, e)
    if (statSync(r).isDirectory()) {
      if (e !== 'node_modules' && e !== 'dist') archivosTs(r, acc)
    } else if (e.endsWith('.ts') && !e.endsWith('.spec.ts')) acc.push(r)
  }
  return acc
}

/** Extrae la clave que se pasa a cada pg_advisory_xact_lock. */
function clavesDeCerrojo(): Array<{ archivo: string; linea: number; clave: string }> {
  const out: Array<{ archivo: string; linea: number; clave: string }> = []
  for (const f of archivosTs(RAIZ)) {
    const lineas = readFileSync(f, 'utf8').split('\n')
    lineas.forEach((l, i) => {
      if (!l.includes('pg_advisory_xact_lock')) return
      // La clave va en la misma línea o en las tres siguientes (llamada multilínea).
      const ventana = lineas.slice(i, i + 4).join('\n')
      const m = ventana.match(/`((?:walk-in|booking|stay|room)[^`]*)`/)
      if (m) out.push({ archivo: f.replace(RAIZ + '/', ''), linea: i + 1, clave: m[1] })
    })
  }
  return out
}

describe('familias de claves de los advisory locks', () => {
  const claves = clavesDeCerrojo()

  it('encuentra cerrojos que auditar — si esto falla, el extractor se rompió', () => {
    expect(claves.length).toBeGreaterThanOrEqual(10)
  })

  it('🔴 todo cerrojo de inventario usa la familia «walk-in:» — o es una excepción declarada', () => {
    const permitidas = new Set(EXCEPCIONES.map((e) => e.clave))
    const infractores = claves.filter((c) => !c.clave.startsWith('walk-in:') && !permitidas.has(c.clave))

    expect(infractores.map((i) => `${i.archivo}:${i.linea} → \`${i.clave}\``)).toEqual([])
  })

  it('el motor público toma el cerrojo por HABITACIÓN, no sólo por property', () => {
    const publico = claves.filter((c) => c.archivo.includes('public-booking'))
    expect(publico.some((c) => c.clave.startsWith('walk-in:'))).toBe(true)
  })

  it('recepción y Channex siguen en la misma familia', () => {
    for (const area of ['guest-stays', 'channex']) {
      const delArea = claves.filter((c) => c.archivo.includes(area))
      expect(delArea.length).toBeGreaterThan(0)
      expect(delArea.every((c) => c.clave.startsWith('walk-in:'))).toBe(true)
    }
  })
})
