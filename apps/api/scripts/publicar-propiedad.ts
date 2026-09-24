/**
 * Publica el motor de reservas de una propiedad. **Lo corre Abraham, no yo.**
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE
 *
 * Para publicar hay que escribir en la base de Zenix, y la credencial de esa
 * base **no puede pasar por el chat** — es la regla dura del proyecto. Un
 * script resuelve el problema entero sin negociarlo: yo escribo QUÉ hacer,
 * Abraham lo corre con la credencial **en su propia terminal**, y el valor
 * nunca existe fuera de su máquina.
 *
 * Es el mismo principio que la seguridad basada en capacidades que ya usamos
 * para el cobro: no se mueve el secreto hacia quien actúa, se mueve la acción
 * hacia donde vive el secreto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CÓMO SE USA
 *
 *     # 1. Ver qué haría, sin tocar nada  (por omisión)
 *     DATABASE_URL='postgresql://…' npx ts-node apps/api/scripts/publicar-propiedad.ts \
 *       --slug hotel-tulum
 *
 *     # 2. Hacerlo de verdad
 *     DATABASE_URL='postgresql://…' npx ts-node apps/api/scripts/publicar-propiedad.ts \
 *       --slug hotel-tulum --aplicar
 *
 * 🔴 **Sin `--aplicar` no escribe nada.** El valor por omisión es el ensayo,
 * no la ejecución: quien corre esto lo hace contra una base de producción, y
 * el modo por omisión de una herramienta destructiva debe ser el inofensivo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE SCRIPT **NO** HACE, A PROPÓSITO
 *
 * · **No crea la propiedad.** Si no existe, se detiene y lo dice. Crear un
 *   hotel desde un script suelto es exactamente cómo aparecen propiedades
 *   fantasma sin organización, sin entidad legal y sin nadie que las recuerde.
 * · **No inventa el perfil fiscal.** Si falta, avisa: sin jurisdicción
 *   verificada el sitio publicará «Consultar», y es mejor saberlo antes.
 * · **No toca precios ni inventario.**
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APLICAR = process.argv.includes('--aplicar')

const ok = (s: string) => console.log(`  ✓ ${s}`)
const info = (s: string) => console.log(`    ${s}`)
const mal = (s: string) => console.error(`  ✗ ${s}`)

async function main() {
  const slug = arg('slug')
  const propertyId = arg('property-id')
  if (!slug) {
    mal('Falta --slug. Es el identificador público que irá en la URL del hotel.')
    process.exit(2)
  }

  console.log(`\n${APLICAR ? '▶ APLICANDO' : '◇ ENSAYO (no escribe nada)'} · slug «${slug}»\n`)

  // ── 1. La propiedad ────────────────────────────────────────────────────
  const propiedad = propertyId
    ? await prisma.property.findUnique({ where: { id: propertyId } })
    : await elegirPropiedad()

  if (!propiedad) {
    mal('No hay ninguna propiedad que publicar. El script NO la crea: eso pasa por el alta del cliente.')
    process.exit(3)
  }
  ok(`Propiedad: ${propiedad.name} (${propiedad.id})`)

  // ── 2. El perfil fiscal, que decide si habrá precio o «Consultar» ──────
  if (!propiedad.regionCode) {
    info('⚠ Sin `regionCode`: el sitio mostrará «Consultar» en vez de precio.')
    info('  No es un error de este script — es que falta el perfil fiscal de la propiedad.')
  } else {
    ok(`Jurisdicción: ${propiedad.regionCode}${propiedad.taxMunicipality ? ` · ${propiedad.taxMunicipality}` : ''}`)
  }

  // ── 3. El slug tiene que ser libre ─────────────────────────────────────
  const ocupado = await prisma.bookingEngineConfig.findUnique({ where: { slug } })
  if (ocupado && ocupado.propertyId !== propiedad.id) {
    mal(`El slug «${slug}» ya lo usa otra propiedad (${ocupado.propertyId}). Es único global.`)
    process.exit(4)
  }

  const actual = await prisma.bookingEngineConfig.findUnique({
    where: { propertyId: propiedad.id },
  })

  if (actual?.enabled && actual.slug === slug) {
    ok('Ya estaba publicada con este slug. No hay nada que hacer.')
    info(`Compruébalo: GET /api/v1/public/properties/${slug}`)
    return
  }

  // ── 4. Qué va a cambiar, dicho antes de cambiarlo ──────────────────────
  console.log('\n  Cambios:')
  if (!actual) {
    info(`+ crear BookingEngineConfig · slug=${slug} · enabled=true`)
    info('  ratesIncludeTaxes queda en su valor por omisión (true). Se ajusta')
    info('  desde Zenix → Tarifas → Control de publicación, viendo el total.')
  } else {
    if (actual.slug !== slug) info(`~ slug: ${actual.slug} → ${slug}`)
    if (!actual.enabled) info('~ enabled: false → true')
  }

  if (!APLICAR) {
    console.log('\n◇ Ensayo terminado. Repite con --aplicar para escribirlo.\n')
    return
  }

  // ── 5. Escribir ────────────────────────────────────────────────────────
  const r = await prisma.bookingEngineConfig.upsert({
    where: { propertyId: propiedad.id },
    create: { propertyId: propiedad.id, slug, enabled: true, publishedAt: new Date() },
    update: { slug, enabled: true, publishedAt: actual?.publishedAt ?? new Date() },
  })
  console.log('')
  ok(`Publicada. slug=${r.slug} · enabled=${r.enabled}`)
  info(`Compruébalo: GET /api/v1/public/properties/${r.slug}`)
  console.log('')
}

/** Si no se pasó `--property-id`, sólo se elige sola cuando NO hay ambigüedad. */
async function elegirPropiedad() {
  const todas = await prisma.property.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, regionCode: true, taxMunicipality: true },
    orderBy: { createdAt: 'asc' },
  })
  if (todas.length === 1) return todas[0]
  if (todas.length === 0) return null

  // 🔴 Con varias, NO adivina. Publicar el hotel equivocado abre al público
  // un inventario que nadie quería publicar, y el error se descubre tarde.
  mal(`Hay ${todas.length} propiedades. Indica cuál con --property-id:`)
  for (const p of todas) console.error(`      ${p.id}  ${p.name}`)
  process.exit(5)
}

main()
  .catch((e) => {
    mal(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
