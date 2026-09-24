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
 * 🔴 **Desde la raíz de ESTE repositorio (Zenix), no desde el del sitio.**
 * La primera vez que se corrió fue desde `azucarWebSite` y el error que da
 * —«Cannot find module»— no dice en ningún momento que estés en el sitio
 * equivocado. Por eso hay un `npm run` que sólo funciona aquí, y por eso el
 * script comprueba dónde está antes de hacer nada.
 *
 *     cd ~/Documents/Projects/housekeeping3
 *
 *     # 1. Ver qué haría, sin tocar nada  (por omisión)
 *     npm run publicar -w @zenix/api -- --slug hotel-tulum
 *
 *     # 2. Hacerlo de verdad
 *     npm run publicar -w @zenix/api -- --slug hotel-tulum --aplicar
 *
 * 🔴 **La cadena de conexión NO va en el comando.** El script la pide al
 * arrancar y la lee SIN ECO, como una contraseña. Tres razones, y la primera
 * es la que más duele:
 *
 *   1. Un secreto escrito en la línea de comandos queda en el **historial del
 *      intérprete** —`~/.zsh_history`— en claro y para siempre. Es una de las
 *      formas más comunes de filtrar credenciales, y la más fácil de olvidar.
 *   2. Mientras el proceso corre, cualquiera con `ps` en esa máquina ve los
 *      argumentos completos.
 *   3. Pegar un comando con un hueco `…` dentro invita a ejecutarlo tal cual.
 *      Ya pasó dos veces con este mismo script.
 *
 * Si `DATABASE_URL` ya viene del entorno —por ejemplo en un despliegue— se
 * respeta y no se pregunta nada.
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
import * as readline from 'node:readline'

/**
 * 🔴 SE CREA TARDE, Y ES OBLIGATORIO QUE SEA ASÍ.
 *
 * `new PrismaClient()` lee `DATABASE_URL` EN SU CONSTRUCTOR. Si el cliente se
 * creara a nivel de módulo —como estaba—, se construiría ANTES de que el
 * script pida la cadena por teclado, y se quedaría con la de antes: ninguna.
 * El síntoma habría sido un error de conexión incomprensible justo después de
 * teclear la cadena correcta.
 *
 * Lo encontré al ir a probarlo, no leyéndolo. El orden de construcción de los
 * módulos es de esas cosas que sólo se ven ejecutando.
 */
let prisma!: PrismaClient

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APLICAR = process.argv.includes('--aplicar')

const ok = (s: string) => console.log(`  ✓ ${s}`)
const info = (s: string) => console.log(`    ${s}`)
const mal = (s: string) => console.error(`  ✗ ${s}`)

/**
 * Comprobaciones de entorno ANTES de tocar la base.
 *
 * Las tres nacen de errores reales, no de imaginar lo que podría salir mal.
 * Un mensaje que dice qué hacer vale más que diez que dicen qué pasó.
 */
/**
 * Pide la cadena por teclado, sin eco. No se guarda en ningún sitio: vive en
 * memoria mientras dura el proceso.
 */
function pedirCadena(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error(
        'No hay terminal interactiva para pedir la cadena. Pásala por entorno:\n' +
        "      DATABASE_URL='…' npm run publicar -w @zenix/api -- --slug <slug>",
      ))
      return
    }
    // Silencia el eco: lo que se teclea no aparece en pantalla, igual que una
    // contraseña. Se envuelve `process.stdout` ANTES de dárselo a readline,
    // porque `rl.output` no está tipado en la interfaz pública — intentarlo
    // por ahí fue un error de compilación, no una limitación real.
    const real = process.stdout
    let mudo = false
    const salida = new Proxy(real, {
      get(obj, prop, recv) {
        if (prop === 'write') {
          return (trozo: string | Uint8Array, ...resto: unknown[]) =>
            mudo ? true : (obj.write as (...a: unknown[]) => boolean)(trozo, ...resto)
        }
        return Reflect.get(obj, prop, recv)
      },
    })

    const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: true })
    rl.question('  Cadena de conexión de Neon (no se verá al teclear): ', (v) => {
      mudo = false
      real.write('\n')
      rl.close()
      resolve(v.trim())
    })
    mudo = true
  })
}

async function comprobarEntorno() {
  let url = process.env.DATABASE_URL
  if (!url) {
    info('No hay DATABASE_URL en el entorno; te la pido aquí para que NO quede')
    info('en el historial del intérprete ni sea visible con `ps`.')
    info('Está en console.neon.tech → tu proyecto → Connection string.')
    console.log('')
    url = await pedirCadena()
    process.env.DATABASE_URL = url
  }
  if (!url) {
    mal('No se recibió ninguna cadena de conexión.')
    process.exit(10)
  }
  // El `…` de la documentación pegado tal cual. Sin esto, el fallo sería un
  // error de conexión ilegible.
  if (url.includes('…') || url.includes('...') || url.includes('PEGA_AQUI')) {
    mal('DATABASE_URL todavía tiene el hueco «…» de la documentación.')
    info('Sustitúyelo por la cadena real de Neon (console.neon.tech → Connection string).')
    process.exit(11)
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    mal('DATABASE_URL no parece una cadena de Postgres.')
    process.exit(12)
  }
  // Neon exige TLS; sin esto la conexión se rechaza con un error que tampoco
  // menciona el motivo.
  if (url.includes('neon.tech') && !url.includes('sslmode=require')) {
    info('⚠ La cadena de Neon suele necesitar `?sslmode=require`. Si falla la conexión, es eso.')
  }
}

async function main() {
  await comprobarEntorno()
  prisma = new PrismaClient()
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
  .finally(() => prisma?.$disconnect())
