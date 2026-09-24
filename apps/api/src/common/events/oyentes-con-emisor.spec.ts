import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * FUNCIÓN DE APTITUD (*fitness function*) — Ford, Parsons & Kua,
 * «Building Evolutionary Architectures»: una regla de arquitectura escrita como
 * prueba ejecutable, para que el diseño no se degrade en silencio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA REGLA: todo `@OnEvent('x')` tiene al menos un `emit` de `'x'`.
 *
 * Un oyente sin emisor **no falla**. No hay error, no hay aviso, no hay prueba
 * en rojo: simplemente no pasa nada, para siempre. Es la clase de defecto más
 * cara de encontrar porque su único síntoma es una ausencia.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 HONESTIDAD SOBRE SU ALCANCE
 *
 * Esta prueba **no** habría cazado el defecto que la motivó. Ahí el emisor
 * existía; lo que pasaba es que estaba detrás de `if (!this.channex.enabled)`,
 * así que el evento sólo se emitía para los hoteles con channel manager. Un
 * análisis estático ve la llamada y da por buena la regla.
 *
 * Ese caso lo caza la prueba de comportamiento de
 * `pms/availability/inventory-events.spec.ts`, que ejecuta el camino **con
 * Channex apagado**.
 *
 * Las dos hacen falta y comprueban cosas distintas: ésta, que el cable esté
 * conectado; la otra, que pase corriente. Decir que una sustituye a la otra
 * sería justo el tipo de falsa seguridad que produjo el defecto.
 */
describe('arquitectura · todo oyente tiene emisor', () => {
  const raiz = join(__dirname, '..', '..')

  const buscar = (patron: string): string => {
    try {
      return execSync(`grep -rn --include=*.ts -E ${JSON.stringify(patron)} .`, {
        cwd: raiz,
        encoding: 'utf-8',
        maxBuffer: 20 * 1024 * 1024,
      })
    } catch {
      return '' // grep sale 1 cuando no hay coincidencias
    }
  }

  /** `export const X = 'valor'` -> { X: 'valor' }, para resolver `@OnEvent(X)`. */
  const constantes = (): Map<string, string> => {
    const mapa = new Map<string, string>()
    const salida = buscar("export const [A-Z_0-9]+ *(:[^=]*)?= *'[^']+'")
    for (const linea of salida.split('\n')) {
      const m = linea.match(/export const ([A-Z_0-9]+) *(?::[^=]*)?= *'([^']+)'/)
      if (m) mapa.set(m[1], m[2])
    }
    return mapa
  }

  it('cada @OnEvent tiene al menos un emisor en el codigo', () => {
    const consts = constantes()

    // Las lineas de comentario se descartan: un `@OnEvent('x')` citado dentro
    // de un bloque de documentacion no escucha nada. Este mismo escaner lo dio
    // por oyente en su primera ejecucion — falso positivo propio, corregido.
    const esComentario = (linea: string): boolean => {
      const codigo = linea.split(':').slice(2).join(':').trimStart()
      return codigo.startsWith('*') || codigo.startsWith('//') || codigo.startsWith('/*')
    }

    const escuchados = new Map<string, string[]>()
    for (const linea of buscar("@OnEvent\\(").split('\n')) {
      if (!linea.trim() || linea.includes('.spec.ts') || esComentario(linea)) continue
      const donde = linea.split(':').slice(0, 2).join(':')
      const literal = linea.match(/@OnEvent\(\s*'([^']+)'/)
      const porConst = linea.match(/@OnEvent\(\s*([A-Z_0-9]+)\s*[,)]/)
      const nombre = literal?.[1] ?? (porConst ? consts.get(porConst[1]) : undefined)
      if (!nombre) continue
      escuchados.set(nombre, [...(escuchados.get(nombre) ?? []), donde])
    }
    expect(escuchados.size).toBeGreaterThan(5)

    const emitidos = new Set<string>()
    let hayEmisionDinamica = false
    for (const linea of buscar("\\.emit\\(").split('\n')) {
      if (!linea.trim() || linea.includes('.spec.ts') || esComentario(linea)) continue
      const literal = linea.match(/\.emit\(\s*'([^']+)'/)
      if (literal) { emitidos.add(literal[1]); continue }
      // Admite el prefijo de espacio de nombres: `Events.STAY_CHECKIN_CONFIRMED`.
      const porConst = linea.match(/\.emit\(\s*(?:[A-Za-z_$][\w$]*\.)?([A-Z_0-9]+)\s*[,)]/)
      const resuelto = porConst ? consts.get(porConst[1]) : undefined
      if (resuelto) { emitidos.add(resuelto); continue }
      // `emit(nombreVariable, …)`: el nombre se decide en ejecucion y el
      // analisis estatico no puede resolverlo.
      if (/\.emit\(\s*[a-z_$][\w$]*\s*[,)]/.test(linea)) hayEmisionDinamica = true
    }

    // Un comodin (`audit.**`) casa con familias enteras: basta un emisor con
    // ese prefijo.
    const tieneEmisor = (evento: string): boolean => {
      if (!evento.includes('*')) return emitidos.has(evento)
      const prefijo = evento.split('*')[0]
      return [...emitidos].some((e) => e.startsWith(prefijo))
    }

    // Un comodin con emision dinamica en el codigo NO se puede probar
    // huerfano. Se declara como no comprobable en vez de acusarlo: un guardian
    // que grita en falso se acaba silenciando, y entonces ya no guarda nada.
    const noComprobables = [...escuchados.keys()].filter(
      (e) => e.includes('*') && hayEmisionDinamica && !tieneEmisor(e),
    )

    const huerfanos = [...escuchados.entries()]
      .filter(([evento]) => !tieneEmisor(evento) && !noComprobables.includes(evento))
      .map(([evento, sitios]) => `  · <${evento}> se escucha en ${sitios.join(', ')} y NADIE lo emite`)

    expect(huerfanos.join('\n') || 'ninguno').toBe('ninguno')
  })

  it('el escaner se muerde: detecta un huerfano de verdad', () => {
    // Prueba de mordida. Un guardian que no se comprueba a si mismo puede
    // estar verde porque su `grep` dejo de encontrar nada — que es
    // exactamente el fallo silencioso que viene a evitar.
    const propio = readFileSync(__filename, 'utf-8')
    expect(propio).toContain('OnEvent')

    const linea = "archivo.ts:10:  @OnEvent('evento.que.nadie.emite', { async: true })"
    const m = linea.match(/@OnEvent\(\s*'([^']+)'/)
    expect(m?.[1]).toBe('evento.que.nadie.emite')

    const emitidos = new Set(['otro.evento'])
    expect(emitidos.has(m![1])).toBe(false)
  })
})
