import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * El precio no sabe quién cobra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UNA PRUEBA Y NO UN COMENTARIO
 *
 * Abraham preguntó si cambiar un precio es ajeno a la pasarela. Lo era —cero
 * menciones de Stripe en toda la cadena— pero eso era **un hecho, no una
 * garantía**: nada impedía que el próximo cambio metiera un `import` de Stripe
 * en el cálculo fiscal para «aprovechar que ya está ahí».
 *
 * Importa porque Zenix usa Stripe y ya hay un hotel —Azucar— que pide cobrar
 * por Banorte. El día que existan dos pasarelas, un precio que dependa de una
 * de ellas se vuelve imposible de mover sin tocar dinero.
 *
 * La regla, en una línea: **el precio se calcula igual lo cobre quien lo
 * cobre.** Lo que sabe de pasarelas es `pago/`, y nadie más.
 */

const RAIZ = join(__dirname, '..', '..')

/** Los archivos que deciden CUÁNTO vale una noche. Ninguno cobra. */
const CADENA_DEL_PRECIO = [
  'pms/room-types',
  'pms/rates',
  'public-booking/public-pricing.service.ts',
  'public-booking/public-booking.service.ts',
  'public-booking/rate-envelope',
]

/** Lo que delata a una pasarela metida donde no toca. */
const SEÑALES = [
  'stripe', 'Stripe',
  'banorte', 'Banorte',
  'paymentIntent', 'client_secret', 'clientSecret',
  'conekta', 'openpay', 'mercadopago', 'paypal',
]

const archivos = (ruta: string): string[] => {
  const p = join(RAIZ, ruta)
  if (!statSync(p).isDirectory()) return [p]
  const out: string[] = []
  const rec = (d: string) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e)
      statSync(f).isDirectory() ? rec(f) : f.endsWith('.ts') && out.push(f)
    }
  }
  rec(p)
  return out
}

describe('arquitectura · el precio no depende de la pasarela', () => {
  it('🔴 ningún archivo de la cadena del precio menciona una pasarela', () => {
    const culpables: string[] = []
    for (const ruta of CADENA_DEL_PRECIO) {
      for (const f of archivos(ruta)) {
        if (f.endsWith('.spec.ts')) continue
        const src = readFileSync(f, 'utf8')
        for (const [i, linea] of src.split('\n').entries()) {
          const codigo = linea.trim()
          // Los comentarios se descartan: explicar POR QUÉ el precio no sabe
          // de pasarelas es exactamente lo que queremos que se escriba.
          if (codigo.startsWith('*') || codigo.startsWith('//') || codigo.startsWith('/*')) continue
          const señal = SEÑALES.find((s) => codigo.includes(s))
          if (señal) culpables.push(`${relative(RAIZ, f)}:${i + 1}  ${señal} → ${codigo.slice(0, 70)}`)
        }
      }
    }
    expect(culpables.join('\n') || 'ninguno').toBe('ninguno')
  })

  it('la mordida: el escáner detecta una mención plantada', () => {
    // Sin esto, el `toBe('ninguno')` de arriba podría estar verde porque el
    // escáner dejó de mirar. Se reconstruye su lógica sobre una línea falsa.
    const linea = "  const pi = await stripe.paymentIntents.create({})"
    expect(SEÑALES.some((s) => linea.includes(s))).toBe(true)
    expect(SEÑALES.some((s) => '  const total = neto + impuestos'.includes(s))).toBe(false)
  })

  it('🔴 y `pago/` es el ÚNICO sitio del motor público que USA una pasarela', () => {
    // El complemento del primero: si mañana alguien mete el cobro en el
    // servicio de reservas o en el calendario, esto se pone rojo.
    //
    // 🔴 Se busca DEPENDENCIA, no la palabra. La primera versión buscaba
    // «stripe» a secas y señaló dos falsos positivos:
    //
    //   · el `summary` de Swagger de la ruta de pago —texto, no código—
    //   · el `import` del MÓDULO, que es donde se cablea el proveedor y tiene
    //     que estar ahí por definición: un módulo de Nest declara lo que
    //     inyecta.
    //
    // Acusar a los dos habría obligado a silenciar el guardián a la semana.
    // Un guardián que da falsos positivos se acaba borrando, y entonces ya no
    // guarda nada.
    const culpables: string[] = []
    const rec = (d: string) => {
      for (const e of readdirSync(d)) {
        const f = join(d, e)
        if (statSync(f).isDirectory()) { rec(f); continue }
        if (!f.endsWith('.ts') || f.endsWith('.spec.ts')) continue
        const rel = relative(RAIZ, f)
        if (rel.includes('public-booking/pago')) continue
        // El módulo cablea los proveedores: ahí el import es obligatorio.
        if (rel.endsWith('.module.ts')) continue
        const src = readFileSync(f, 'utf8')
        for (const [i, linea] of src.split('\n').entries()) {
          const c = linea.trim()
          if (c.startsWith('*') || c.startsWith('//') || c.startsWith('/*')) continue
          // Uso real: acceso a miembro (`stripe.algo`), llamada a la API
          // (`paymentIntents`) o importar el SDK. No una palabra en un texto.
          const usa =
            /\bstripe\s*\./i.test(c) ||
            /\bpaymentIntents\b/.test(c) ||
            /from\s+['"][^'"]*stripe[^'"]*['"]/i.test(c)
          if (usa) {
            culpables.push(`${relative(RAIZ, f)}:${i + 1}  ${c.slice(0, 70)}`)
          }
        }
      }
    }
    rec(join(RAIZ, 'public-booking'))
    expect(culpables.join('\n') || 'ninguno').toBe('ninguno')
  })
})
