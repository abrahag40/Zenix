// 🔴 Sobreventa: la web contra el mostrador, con DOS CONEXIONES REALES.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
// La auditoría del 2026-09-22 encontró que en los 105 specs el advisory lock
// está SIEMPRE mockeado, y que no existía un solo archivo e2e. Consecuencia
// medida: borrar la línea del lock dejaba 1 316 pruebas en verde.
//
// Un lock no se puede probar con un cliente mockeado, porque lo que se prueba
// es precisamente que DOS transacciones distintas se excluyen. Hacen falta dos
// conexiones de verdad.
//
// ── LAS DOS GARANTÍAS QUE SE COMPRUEBAN ─────────────────────────────────────
// 1. El advisory lock serializa: dos transacciones que piden la misma clave
//    `walk-in:<roomId>` no se solapan en el tiempo.
// 2. La restricción EXCLUDE lo hace IMPOSIBLE aunque el lock falle: es lo único
//    que sobrevive al día que alguien escriba un quinto flujo y se olvide.
//
// ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
//   DATABASE_URL=postgresql://… npx jest --config test/jest-e2e.json
// Sin DATABASE_URL se salta con un aviso, en vez de fallar: es un e2e, no una
// prueba unitaria.

import { PrismaClient } from '@prisma/client'

const URL_BD = process.env.DATABASE_URL
const describeSiHayBd = URL_BD ? describe : describe.skip

if (!URL_BD) {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  Sin DATABASE_URL: se salta el e2e de sobreventa. NO es un pase.\n')
}

const PREFIJO = 'e2e-overbooking-'
const ID = (s: string) => `${PREFIJO}${s}`

/** Se resuelve en `sembrar()`: un journey REAL, porque stay_segments.journey_id es FK. */
let journeyId: string

describeSiHayBd('sobreventa — web contra mostrador', () => {
  let a: PrismaClient
  let b: PrismaClient

  beforeAll(async () => {
    a = new PrismaClient({ datasources: { db: { url: URL_BD } } })
    b = new PrismaClient({ datasources: { db: { url: URL_BD } } })
    await a.$connect()
    await b.$connect()
    await limpiar(a)
    await sembrar(a)
  }, 60_000)

  afterAll(async () => {
    if (a) { await limpiar(a); await a.$disconnect() }
    if (b) await b.$disconnect()
  }, 60_000)

  it('🔴 el advisory lock SERIALIZA dos transacciones sobre la misma habitación', async () => {
    const orden: string[] = []
    const clave = `walk-in:${ID('hab')}`

    // A toma el lock y lo retiene 400 ms. B pide el mismo y tiene que esperar.
    const tA = a.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', clave)
      orden.push('A entra')
      await new Promise((r) => setTimeout(r, 400))
      orden.push('A sale')
    }, { timeout: 20_000 })

    await new Promise((r) => setTimeout(r, 80)) // asegura que A llega primero

    const tB = b.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', clave)
      orden.push('B entra')
    }, { timeout: 20_000 })

    await Promise.all([tA, tB])

    // Si las claves fueran de familias distintas, B entraría ANTES de que A salga.
    expect(orden).toEqual(['A entra', 'A sale', 'B entra'])
  }, 30_000)

  it('dos claves DISTINTAS no se bloquean — el lock no sobre-serializa', async () => {
    const orden: string[] = []
    const tA = a.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', `walk-in:${ID('hab')}`)
      orden.push('A entra')
      await new Promise((r) => setTimeout(r, 400))
      orden.push('A sale')
    }, { timeout: 20_000 })

    await new Promise((r) => setTimeout(r, 80))

    const tB = b.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', `walk-in:${ID('otra-hab')}`)
      orden.push('B entra')
    }, { timeout: 20_000 })

    await Promise.all([tA, tB])
    expect(orden).toEqual(['A entra', 'B entra', 'A sale'])
  }, 30_000)

  it('🔴 la restricción EXCLUDE impide la sobreventa aunque NO haya lock', async () => {
    // Sin tomar ningún lock, a propósito: esto prueba que la garantía vive en la
    // base y no en la disciplina del código.
    await crearSegmento(a, 'ocupa', '2026-12-20', '2026-12-23', 'ACTIVE')

    await expect(
      crearSegmento(b, 'sobreventa', '2026-12-22', '2026-12-25', 'PENDING'),
    ).rejects.toThrow(/stay_segments_sin_solape|exclusion constraint/i)
  }, 30_000)

  it('la ROTACIÓN normal sigue permitida: entrar el día de salida', async () => {
    await expect(
      crearSegmento(b, 'rotacion', '2026-12-23', '2026-12-26', 'PENDING'),
    ).resolves.toBeDefined()
  }, 30_000)

  it('una estadía CANCELADA no bloquea inventario', async () => {
    await expect(
      crearSegmento(b, 'cancelada', '2026-12-21', '2026-12-22', 'CANCELLED'),
    ).resolves.toBeDefined()
  }, 30_000)
})

// ── utilidades ──────────────────────────────────────────────────────────────

async function crearSegmento(
  c: PrismaClient, sufijo: string, desde: string, hasta: string, estado: string,
) {
  return c.$executeRawUnsafe(
    `INSERT INTO stay_segments
       (id, journey_id, room_id, check_in, check_out, status, locked, reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4::timestamp, $5::timestamp, $6::segment_status, false, 'ORIGINAL', now(), now())`,
    ID(sufijo), journeyId, ID('hab'), `${desde} 15:00`, `${hasta} 12:00`, estado,
  )
}

async function sembrar(c: PrismaClient) {
  // 🔑 Se CLONA una habitación existente en vez de construirla a mano.
  //
  // El primer intento listaba las columnas (`property_id`, `status`…) y falló:
  // la tabla usa `propertyId` en camelCase y exige `category`, `capacity` y
  // `room_status`. Escribir la lista a mano ata esta prueba al esquema y la
  // rompe cada vez que `rooms` gana una columna obligatoria.
  //
  // `INSERT … SELECT` con sustitución de id y número copia la fila entera sea
  // cual sea su forma. La prueba no necesita saber qué columnas hay: necesita
  // una habitación válida.
  const base = await c.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM rooms LIMIT 1')
  if (!base.length) {
    throw new Error('La base no tiene ninguna habitación: corre el seed antes del e2e.')
  }
  // stay_segments.journey_id es clave foránea, así que hace falta uno REAL. No se
  // crea ni se borra: sólo se referencia, y la limpieza sólo toca filas con el prefijo.
  const viaje = await c.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM stay_journeys LIMIT 1')
  if (!viaje.length) {
    throw new Error('La base no tiene ningún stay_journey: corre el seed antes del e2e.')
  }
  journeyId = viaje[0].id
  for (const [nuevoId, numero] of [[ID('hab'), 'E2E-1'], [ID('otra-hab'), 'E2E-2']] as const) {
    await c.$executeRawUnsafe(
      `INSERT INTO rooms
       SELECT (n).* FROM rooms r
         CROSS JOIN LATERAL (
           SELECT jsonb_populate_record(
             NULL::rooms,
             to_jsonb(r) || jsonb_build_object('id', $2::text, 'number', $3::text)
           ) AS n
         ) x
       WHERE r.id = $1
       ON CONFLICT (id) DO NOTHING`,
      base[0].id, nuevoId, numero,
    )
  }
}

async function limpiar(c: PrismaClient) {
  await c.$executeRawUnsafe(`DELETE FROM stay_segments WHERE id LIKE '${PREFIJO}%'`)
  await c.$executeRawUnsafe(`DELETE FROM rooms WHERE id LIKE '${PREFIJO}%'`)
}
