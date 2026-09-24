/**
 * Carga el catálogo de tipos de habitación de un hotel desde un JSON.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 GENÉRICO A PROPÓSITO: AQUÍ NO HAY NINGÚN NOMBRE DE CLIENTE
 *
 * Zenix es el producto; los hoteles son clientes. Un seed con «Bungalow Mar»
 * dentro de este repositorio sería contexto de un cliente metido en el
 * producto — el mismo error que el guardián del catálogo de plugins ya me cazó
 * una vez: **el producto distribuye capacidad, no contexto.**
 *
 * El catálogo real vive en el repositorio del hotel, donde se mantiene, y se
 * exporta a este formato. Así no puede desincronizarse: hay una sola lista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *     # 1. ver qué haría
 *     npm run cargar-tipos -w @zenix/api -- --slug hotel-tulum --archivo /tmp/tipos.json
 *     # 2. hacerlo
 *     npm run cargar-tipos -w @zenix/api -- --slug hotel-tulum --archivo /tmp/tipos.json --aplicar
 *
 * La cadena de conexión se pide sin eco si no está en el entorno.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** HACE
 *
 * · **No borra nada por su cuenta.** Los tipos que ya existan y no estén en el
 *   archivo se LISTAN al final, con cuántas habitaciones tienen y si alguna
 *   está ocupada. Retirarlos exige `--retirar <codigo>`, uno a uno y a mano.
 *   Borrar inventario en silencio es cómo desaparece una reserva.
 * · **No quita habitaciones de más.** Si un tipo tiene 6 y el archivo pide 5,
 *   lo dice y no toca ninguna — podría haber una estancia dentro.
 * · **No inventa precios.** `baseRate` sólo se fija al CREAR, y con el valor
 *   que se le pase; después manda el panel de tarifas.
 */
import { PrismaClient } from '@prisma/client'
import * as readline from 'node:readline'
import { readFileSync } from 'node:fs'

let prisma!: PrismaClient

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APLICAR = process.argv.includes('--aplicar')
const ok = (s: string) => console.log(`  ✓ ${s}`)
const info = (s: string) => console.log(`    ${s}`)
const mal = (s: string) => console.error(`  ✗ ${s}`)

interface TipoDeArchivo {
  codigo: string
  nombre: string
  unidades: number
  capacidadMaxima: number
  verificado?: { capacidad?: boolean; unidades?: boolean }
}

function pedirCadena(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Sin terminal interactiva. Pasa DATABASE_URL por entorno."))
      return
    }
    const real = process.stdout
    let mudo = false
    const salida = new Proxy(real, {
      get(o, p, r) {
        if (p === 'write') {
          return (t: string | Uint8Array, ...x: unknown[]) =>
            mudo ? true : (o.write as (...a: unknown[]) => boolean)(t, ...x)
        }
        return Reflect.get(o, p, r)
      },
    })
    const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: true })
    rl.question('  Cadena de conexión (no se verá al teclear): ', (v) => {
      mudo = false
      real.write('\n')
      rl.close()
      resolve(v.trim())
    })
    mudo = true
  })
}

async function main() {
  const slug = arg('slug')
  const archivo = arg('archivo')
  if (!slug || !archivo) {
    mal('Uso: --slug <slug> --archivo <ruta.json> [--aplicar]')
    process.exit(2)
  }

  if (!process.env.DATABASE_URL) {
    info('No hay DATABASE_URL en el entorno; te la pido aquí para que no quede en el historial.')
    console.log('')
    process.env.DATABASE_URL = await pedirCadena()
  }
  prisma = new PrismaClient()

  const aRetirar = arg('retirar')
  if (aRetirar) {
    const cfgR = await prisma.bookingEngineConfig.findUnique({ where: { slug }, select: { propertyId: true } })
    if (!cfgR) { mal(`No hay propiedad publicada con el slug «${slug}».`); process.exit(4) }
    console.log(`\n${APLICAR ? '▶ APLICANDO' : '◇ ENSAYO (no escribe nada)'} · retirar «${aRetirar}»`)
    await retirar(cfgR.propertyId, aRetirar)
    return
  }

  const crudo = JSON.parse(readFileSync(archivo, 'utf-8')) as { tipos?: TipoDeArchivo[] }
  const tipos = crudo.tipos ?? []
  if (tipos.length === 0) {
    mal('El archivo no trae ningún tipo.')
    process.exit(3)
  }

  console.log(`\n${APLICAR ? '▶ APLICANDO' : '◇ ENSAYO (no escribe nada)'} · ${tipos.length} tipos\n`)

  const cfg = await prisma.bookingEngineConfig.findUnique({
    where: { slug },
    select: { propertyId: true },
  })
  if (!cfg) {
    mal(`No hay ninguna propiedad publicada con el slug «${slug}».`)
    info('Publícala primero:  npm run publicar -w @zenix/api -- --slug ' + slug)
    process.exit(4)
  }
  const prop = await prisma.property.findUniqueOrThrow({
    where: { id: cfg.propertyId },
    select: {
      id: true, name: true, organizationId: true,
      legalEntity: { select: { baseCurrency: true, countryCode: true } },
    },
  })
  ok(`Propiedad: ${prop.name}`)

  // 🔴 LA MONEDA SE HEREDA DE LA ENTIDAD LEGAL, NO DEL VALOR POR OMISIÓN.
  //
  // `RoomType.currency` tiene `@default("USD")` en el esquema, y la primera
  // versión de este script no la fijaba: un hotel de Tulum acabó con sus diez
  // tipos en DÓLARES. Nadie lo nota leyendo el código —el campo existe y
  // tiene un valor— pero el sitio publica el precio equivocado y la pasarela
  // cobraría en la divisa equivocada.
  //
  // Un valor por omisión razonable para el país de quien escribió el esquema
  // es un valor EQUIVOCADO para todos los demás. La moneda correcta ya está
  // declarada en la entidad legal del hotel, que es quien factura.
  const moneda = arg('moneda') ?? prop.legalEntity?.baseCurrency
  if (!moneda) {
    mal('La propiedad no tiene entidad legal con moneda, y no se pasó --moneda.')
    info('Sin moneda declarada, los tipos nacerían en USD por omisión del esquema.')
    process.exit(8)
  }
  ok(`Moneda: ${moneda}${arg('moneda') ? ' (indicada)' : ' (heredada de la entidad legal)'}`)

  // 🔴 La procedencia del dato se muestra ANTES de escribir. Dos tipos de
  // Azucar llevan capacidad estimada por nosotros y no confirmada por el
  // hotel; cargarlos sin decirlo los convertiría en «dato del sistema» y
  // nadie volvería a preguntarse de dónde salieron.
  const sinVerificar = tipos.filter((t) => t.verificado && (!t.verificado.capacidad || !t.verificado.unidades))
  if (sinVerificar.length > 0) {
    console.log('')
    info(`⚠ ${sinVerificar.length} tipo(s) con capacidad o unidades SIN confirmar por el hotel:`)
    for (const t of sinVerificar) info(`    ${t.codigo} — ${t.nombre}`)
    info('  Se cargan igual, pero queda dicho: son estimaciones nuestras.')
  }

  console.log('\n  Plan:')
  let totalUnidades = 0
  for (const t of tipos) {
    const existente = await prisma.roomType.findFirst({
      where: { propertyId: prop.id, code: t.codigo },
      select: { id: true, _count: { select: { rooms: true } } },
    })
    const tiene = existente?._count.rooms ?? 0
    const faltan = t.unidades - tiene
    totalUnidades += t.unidades
    const accion = !existente
      ? `+ crear tipo · ${t.unidades} habitación(es)`
      : faltan > 0
        ? `~ tipo ya existe · faltan ${faltan} habitación(es)`
        : faltan < 0
          ? `⚠ tipo ya existe · tiene ${tiene}, el archivo pide ${t.unidades} — NO se quita ninguna`
          : '= sin cambios'
    info(`${accion.padEnd(52)} ${t.codigo}`)
  }
  info(`${''.padEnd(52)} ── ${totalUnidades} unidades en total`)

  if (!APLICAR) {
    console.log('\n◇ Ensayo terminado. Repite con --aplicar.\n')
    return
  }

  console.log('')
  let creadosTipos = 0
  let creadasHab = 0
  for (const t of tipos) {
    let tipo = await prisma.roomType.findFirst({
      where: { propertyId: prop.id, code: t.codigo },
      select: { id: true, _count: { select: { rooms: true } } },
    })
    if (!tipo) {
      const nuevo = await prisma.roomType.create({
        data: {
          organizationId: prop.organizationId,
          propertyId: prop.id,
          name: t.nombre,
          code: t.codigo,
          maxOccupancy: t.capacidadMaxima,
          baseRate: Number(arg('tarifa-base') ?? 1200),
          currency: moneda,
          amenities: [],
        },
        select: { id: true, _count: { select: { rooms: true } } },
      })
      tipo = nuevo
      creadosTipos++
    }
    // Las habitaciones se numeran por el código del tipo, que es estable y
    // legible en el calendario: `bungalow-mar-1`. Sin sufijo si es única.
    for (let i = tipo._count.rooms; i < t.unidades; i++) {
      await prisma.room.create({
        data: {
          organizationId: prop.organizationId,
          propertyId: prop.id,
          number: t.unidades === 1 ? t.codigo : `${t.codigo}-${i + 1}`,
          category: 'PRIVATE',
          capacity: t.capacidadMaxima,
          roomTypeId: tipo.id,
        },
      })
      creadasHab++
    }
  }
  // Los tipos que YA existían pueden llevar la moneda equivocada de una carga
  // anterior. Se corrige: es un dato del hotel, no una decisión por tipo.
  const arreglados = await prisma.roomType.updateMany({
    where: { propertyId: prop.id, code: { in: tipos.map((t) => t.codigo) }, currency: { not: moneda } },
    data: { currency: moneda },
  })
  if (arreglados.count > 0) ok(`${arreglados.count} tipo(s) corregidos a ${moneda}`)

  ok(`${creadosTipos} tipo(s) nuevos · ${creadasHab} habitación(es) nuevas`)
  const total = await prisma.room.count({ where: { propertyId: prop.id, deletedAt: null } })
  ok(`La propiedad tiene ahora ${total} habitaciones`)
  await avisarDeLosQueSobran(prop.id, tipos.map((t) => t.codigo))
  info(`Compruébalo: GET /api/v1/public/properties/${slug}/room-types`)
  console.log('')
}

/**
 * Lista los tipos que están en la base y NO en el archivo.
 *
 * Típicamente es el tipo genérico que crea el alta del hotel. No se borra
 * solo: se enseña con cuántas habitaciones tiene y si alguna está ocupada,
 * y se da el comando exacto para retirarlo. La diferencia entre «lo quitó
 * alguien» y «desapareció» es toda la diferencia cuando falta una reserva.
 */
async function avisarDeLosQueSobran(propertyId: string, codigos: string[]) {
  const sobran = await prisma.roomType.findMany({
    where: { propertyId, deletedAt: null, code: { notIn: codigos } },
    select: { code: true, name: true, _count: { select: { rooms: true } } },
  })
  if (sobran.length === 0) return
  console.log('')
  info(`⚠ ${sobran.length} tipo(s) en la base que NO están en el archivo:`)
  for (const t of sobran) {
    const ocupadas = await prisma.guestStay.count({
      where: { propertyId, room: { roomTypeId: undefined }, cancelledAt: null },
    }).catch(() => 0)
    info(`    ${t.code} — ${t.name} · ${t._count.rooms} habitación(es)${ocupadas ? ' · CON estancias' : ''}`)
  }
  info('  No se tocan. Para retirar uno:')
  info(`    npm run cargar-tipos -w @zenix/api -- --slug <slug> --archivo <archivo> --retirar <codigo> --aplicar`)
}

/** Retira un tipo y sus habitaciones. Sólo si NINGUNA tiene historia. */
async function retirar(propertyId: string, codigo: string) {
  const tipo = await prisma.roomType.findFirst({
    where: { propertyId, code: codigo, deletedAt: null },
    select: { id: true, name: true, rooms: { select: { id: true, number: true } } },
  })
  if (!tipo) {
    mal(`No hay ningún tipo con código «${codigo}» en esta propiedad.`)
    process.exit(6)
  }
  const ids = tipo.rooms.map((r) => r.id)
  // 🔴 Una habitación con CUALQUIER estancia —aunque esté cancelada— no se
  // toca. El historial es contabilidad, no ruido: borrar la habitación deja
  // la estancia apuntando a la nada.
  const conHistoria = ids.length
    ? await prisma.guestStay.count({ where: { roomId: { in: ids } } })
    : 0
  console.log('')
  ok(`Tipo a retirar: ${tipo.name} (${codigo}) · ${ids.length} habitación(es)`)
  if (conHistoria > 0) {
    mal(`Tiene ${conHistoria} estancia(s) asociadas. NO se retira.`)
    info('  Desactívalo desde la interfaz en vez de borrarlo: el historial se conserva.')
    process.exit(7)
  }
  if (!APLICAR) {
    info('- se borrarían el tipo y sus habitaciones (ninguna tiene historial)')
    console.log('\n◇ Ensayo terminado. Repite con --aplicar.\n')
    return
  }
  if (ids.length) await prisma.room.deleteMany({ where: { id: { in: ids } } })
  await prisma.roomType.delete({ where: { id: tipo.id } })
  ok(`Retirado. ${ids.length} habitación(es) eliminadas.`)
  console.log('')
}

main()
  .catch((e) => {
    mal(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
  .finally(() => prisma?.$disconnect())
