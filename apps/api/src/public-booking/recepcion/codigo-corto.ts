/**
 * El código que el recepcionista teclea en la tableta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SIRVE `MX-W-000-2610-0001`
 *
 * Dieciocho caracteres con guiones, tecleados a mano con el huésped delante.
 * Es lento y se equivoca. Hace falta algo corto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 PERO «CORTO» ABRE DOS ATAQUES, Y LOS DOS SE DISEÑAN AQUÍ
 *
 * **1 · Enumeración.** Un código corto se puede probar a lo bruto hasta dar con
 * reservas ajenas y leer los datos de otros huéspedes. La defensa NO es que el
 * código sea largo: es que la ruta exija sesión de personal, esté acotada a SU
 * propiedad y tenga límite de intentos. El código sólo tiene que ser difícil de
 * acertar **por casualidad**, y para eso 6 caracteres de un alfabeto de 30 dan
 * 729 millones de combinaciones.
 *
 * **2 · El error de tecleo que encuentra OTRA reserva.** Peor que no encontrar
 * nada: el recepcionista teclea mal, sale otro huésped, y le hace firmar el
 * contrato equivocado. Se evita con dos cosas:
 *
 *   · **Alfabeto sin caracteres confundibles.** Fuera `0/O`, `1/I/L`, `U/V`.
 *     Es la idea de Crockford Base32, y aquí importa más que en ningún sitio
 *     porque lo teclea una persona leyendo de una pantalla.
 *   · **Un carácter de control.** Cambiar una letra, o intercambiar dos
 *     contiguas —los dos errores humanos más comunes— produce un código que
 *     NO valida, y ni siquiera se consulta la base.
 */

/**
 * Treinta caracteres. Sin `0 O` (se confunden), sin `1 I L` (íd.), sin `U`
 * (se confunde con `V` escrito a mano y en algunas tipografías).
 */
export const ALFABETO = '23456789ABCDEFGHJKMNPQRSTWXYZ'

const LARGO = 5 // más el carácter de control = 6 tecleados

/**
 * Carácter de control por suma ponderada, módulo 29.
 *
 * Los pesos crecientes hacen que **intercambiar dos caracteres contiguos
 * cambie la suma** — con pesos iguales no la cambiaría, y la transposición es
 * el segundo error de tecleo más común después de la sustitución.
 */
function control(cuerpo: string): string {
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const v = ALFABETO.indexOf(cuerpo[i])
    if (v < 0) throw new Error(`carácter fuera del alfabeto: ${cuerpo[i]}`)
    suma += v * (i + 2)
  }
  return ALFABETO[suma % ALFABETO.length]
}

/** Genera un código nuevo. Quien lo llama comprueba que no exista ya. */
export function generarCodigo(aleatorio: () => number = Math.random): string {
  let cuerpo = ''
  for (let i = 0; i < LARGO; i++) {
    cuerpo += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)]
  }
  return cuerpo + control(cuerpo)
}

/**
 * Normaliza lo que el recepcionista tecleó y comprueba el control.
 *
 * Acepta minúsculas, espacios y guiones —la gente los mete— y traduce los
 * confundibles obvios: quien ve una `O` en la pantalla teclea `O`, aunque el
 * alfabeto no la tenga. Rechazarlo sería castigar al usuario por un defecto de
 * la tipografía.
 */
export function normalizar(tecleado: string): string | null {
  // Mapa explícito: más fácil de leer y de auditar que una cadena de
  // `replace`. Cadena vacía = ese carácter no existe y no se adivina.
  const mapa: Record<string, string> = { O: '', Q: 'Q', I: 'J', L: 'J', U: 'V', '0': '', '1': '' }
  const s = (tecleado ?? '').toUpperCase().replace(/[\s-]/g, '')
  let out = ''
  for (const c of s) {
    const m = mapa[c]
    if (m === '') return null // `O`, `0` y `1` no existen y no se adivinan
    out += m ?? c
  }
  if (out.length !== LARGO + 1) return null
  const cuerpo = out.slice(0, LARGO)
  for (const c of cuerpo) if (!ALFABETO.includes(c)) return null
  if (!ALFABETO.includes(out[LARGO])) return null
  // 🔴 El control se comprueba ANTES de tocar la base. Un código mal tecleado
  // ni siquiera llega a consultarse: no hay enumeración gratis.
  return control(cuerpo) === out[LARGO] ? out : null
}
