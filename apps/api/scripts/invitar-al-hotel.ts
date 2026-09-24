/**
 * Invitar a alguien del hotel a entrar a Zenix.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PARA QUÉ SIRVE
 *
 * Para que el hotel entre por su cuenta y **cambie sus propios precios**, sin
 * que nadie de ZaharDev toque su contraseña ni una sola vez.
 *
 * El script NO crea contraseñas. Crea una **invitación**: un enlace de un solo
 * uso, válido 72 horas, que el gerente abre y donde él elige su contraseña. De
 * ese enlace en la base sólo queda el hash — el token en claro lo imprime este
 * script una vez y no vuelve a existir en ninguna parte.
 *
 * Si se pierde, no se recupera: se emite otro. Eso no es una molestia, es la
 * propiedad que hace que valga.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   npm run invitar -w @zenix/api -- \
 *     --propiedad prop-azucar-hotel-tulum \
 *     --correo gerencia@elhotel.com \
 *     --nombre "Nombre Apellido" \
 *     --rol SUPERVISOR \
 *     --aplicar
 *
 * Sin `--aplicar` no escribe nada: enseña qué haría. Es lo mismo que hacen
 * `publicar-propiedad.ts` y `cargar-tipos.ts`, y por el mismo motivo — el
 * primer intento de un comando destructivo casi nunca es el bueno.
 *
 * 🔴 EL ROL IMPORTA. Para tocar tarifas hace falta `SUPERVISOR`: es lo que
 * exige `rates.controller.ts` en todas sus rutas de escritura. `RECEPTIONIST`
 * entra y trabaja, pero no cambia precios. Se pide explícito y no se pone por
 * omisión: dar de más es el error que nadie nota hasta que pasa algo.
 */
import { PrismaClient } from '@prisma/client'
import * as readline from 'node:readline'
import { InvitacionDeStaffService } from '../src/auth/invitacion/invitacion-de-staff.service'

const ROLES = ['SUPERVISOR', 'RECEPTIONIST', 'HOUSEKEEPER'] as const
type Rol = (typeof ROLES)[number]

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`
const rojo = (s: string) => `\x1b[31m${s}\x1b[0m`
const gris = (s: string) => `\x1b[90m${s}\x1b[0m`
const ok = (s: string) => console.log(`  ${verde('✓')} ${s}`)
const mal = (s: string) => console.error(`  ${rojo('✗')} ${s}`)
const info = (s: string) => console.log(gris(`    ${s}`))

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Pide la cadena de conexión por teclado, sin eco y sin dejar rastro. */
function pedirCadena(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Sin terminal. Pásala por entorno: DATABASE_URL='…' npm run invitar …"))
      return
    }
    const real = process.stdout
    let mudo = false
    const salida = new Proxy(real, {
      get(obj, prop, recv) {
        if (prop === 'write') {
          return (t: string | Uint8Array, ...r: unknown[]) =>
            mudo ? true : (obj.write as (...a: unknown[]) => boolean)(t, ...r)
        }
        return Reflect.get(obj, prop, recv)
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

// 🔴 `let` y no `const` con `new PrismaClient()` arriba: el constructor lee
// `DATABASE_URL` en el acto, y si el cliente se crea antes de pedirla, se
// queda con la que había —o con ninguna—. Ya mordió una vez.
let prisma!: PrismaClient

async function main() {
  const propertyId = arg('propiedad')
  const correo = arg('correo')
  const nombre = arg('nombre')
  const rol = (arg('rol') ?? '') as Rol
  const aplicar = process.argv.includes('--aplicar')
  const base = arg('base') ?? 'https://app.zenix.mx'

  if (!propertyId || !correo || !nombre || !ROLES.includes(rol)) {
    mal('Faltan datos.')
    info('npm run invitar -w @zenix/api -- \\')
    info('  --propiedad <id> --correo <correo> --nombre "Nombre Apellido" \\')
    info(`  --rol <${ROLES.join('|')}> [--base https://…] --aplicar`)
    info('')
    info('Para cambiar precios hace falta SUPERVISOR.')
    process.exit(2)
  }

  if (!process.env.DATABASE_URL) {
    info('No hay DATABASE_URL en el entorno; te la pido aquí para que NO quede')
    info('en el historial del intérprete ni sea visible con `ps`.')
    console.log('')
    process.env.DATABASE_URL = await pedirCadena()
  }
  if (!process.env.DATABASE_URL) {
    mal('No se recibió ninguna cadena de conexión.')
    process.exit(10)
  }

  prisma = new PrismaClient()
  const servicio = new InvitacionDeStaffService(prisma as never)

  const prop = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true },
  })
  if (!prop) {
    mal(`No existe la propiedad «${propertyId}».`)
    const todas = await prisma.property.findMany({ select: { id: true, name: true }, take: 10 })
    for (const p of todas) info(`  ${p.id}  ·  ${p.name}`)
    process.exit(3)
  }

  console.log('')
  ok(`Propiedad: ${prop.name}  (${prop.id})`)
  ok(`Persona:   ${nombre} <${correo.toLowerCase()}>`)
  ok(`Rol:       ${rol}${rol === 'SUPERVISOR' ? ' — puede cambiar precios' : ' — NO puede cambiar precios'}`)
  console.log('')

  if (!aplicar) {
    info('Esto es un ensayo: no se ha escrito nada.')
    info('Añade --aplicar para emitir la invitación de verdad.')
    await prisma.$disconnect()
    return
  }

  const r = await servicio.emitir({ propertyId: prop.id, email: correo, nombre, rol })
  const enlace = `${base.replace(/\/+$/, '')}/invitacion/${r.token}`

  console.log('')
  ok(r.creado ? 'Ficha creada e invitación emitida.' : 'Ficha ya existía: invitación renovada.')
  console.log('')
  console.log('  ' + verde('Enlace para el hotel (cópialo y mándaselo):'))
  console.log('')
  console.log('    ' + enlace)
  console.log('')
  info(`Caduca el ${r.expiraEn.toLocaleString('es-MX')} — 72 horas.`)
  info('Se usa UNA vez. Si lo pierden, vuelve a correr este comando.')
  info('')
  info('🔴 Este enlace NO se puede volver a consultar: en la base sólo queda su')
  info('   hash. Si cierras la terminal sin copiarlo, emite otro.')
  console.log('')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  mal(String(e?.message ?? e))
  try { await prisma?.$disconnect() } catch { /* ya estaba cerrada */ }
  process.exit(1)
})
