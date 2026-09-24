import 'reflect-metadata'
import { ValidationPipe, BadRequestException } from '@nestjs/common'
import { CreateReservationDto } from '../dto/create-reservation.dto'

/**
 * 🔴 PRUEBAS ADVERSARIALES — se escriben desde el lado del atacante.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ SE ESTÁ DEFENDIENDO
 *
 * El motor público está abierto a internet. Cualquiera puede mandarle lo que
 * quiera, y las dos cosas que NUNCA puede decidir el cliente son:
 *
 *   1. **Cuánto se cobra.**
 *   2. **A dónde va el dinero.**
 *
 * Hoy las dos están bien: el DTO no tiene ningún campo de importe, el precio lo
 * calcula el servidor, y la cuenta destino todavía no existe en ningún camino.
 * Esta prueba no arregla nada — **fija lo que ya está bien para que siga
 * estándolo**.
 *
 * Y ése es justo su valor. El campo peligroso no lo añade un atacante: lo añade
 * un compañero con buena intención, seis meses después, porque «el front ya
 * tiene el total calculado, para qué recalcularlo». Ahí es donde esta prueba se
 * pone roja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA TÉCNICA: *mass assignment* y cómo se cierra
 *
 * La familia de fallo se llama **mass assignment** (OWASP API3:2023 — *Broken
 * Object Property Level Authorization*): el servidor copia a su modelo todo lo
 * que vino en el cuerpo, incluidos campos que el cliente no debería poder fijar.
 * Es la misma clase de fallo que en 2012 permitió a un usuario de GitHub
 * añadirse como colaborador de un repositorio ajeno.
 *
 * Se cierra con **lista blanca, no lista negra**: `forbidNonWhitelisted: true`
 * en el `ValidationPipe` rechaza cualquier propiedad que el DTO no declare. Una
 * lista negra —«prohibir `price`»— habría que ampliarla cada vez que alguien
 * inventa un nombre nuevo, y llega siempre tarde.
 */
describe('🔒 integridad del precio y del destino — pruebas adversariales', () => {
  // El mismo pipe que corre en `main.ts`. Si allí cambia la configuración y
  // aquí no, esta prueba deja de proteger — por eso se replica el objeto
  // entero, para que la diferencia se vea al leer.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  })
  const meta = { type: 'body' as const, metatype: CreateReservationDto }

  const legitima = () => ({
    guest: { name: 'María González', email: 'maria@example.com' },
    rooms: [
      { roomTypeId: 'rt-1', checkIn: '2026-12-24', checkOut: '2026-12-27', adults: 2 },
    ],
  })

  const atacar = async (cuerpo: unknown) => {
    try {
      await pipe.transform(cuerpo, meta)
      return { rechazado: false, mensaje: '' }
    } catch (e) {
      const r = (e as BadRequestException).getResponse() as { message?: string[] }
      return { rechazado: e instanceof BadRequestException, mensaje: (r.message ?? []).join(' · ') }
    }
  }

  it('la petición legítima pasa (si no, las demás no prueban nada)', async () => {
    expect((await atacar(legitima())).rechazado).toBe(false)
  })

  // ── Ataque 1: fijar el precio ─────────────────────────────────────────────
  it('🔴 NO se puede mandar el importe: ni uno solo de sus nombres pasa', async () => {
    // Se prueban los nombres que un atacante —o un compañero con prisa—
    // intentaría de verdad, no un campo inventado.
    for (const campo of [
      'price', 'amount', 'total', 'totalAmount', 'totalCents', 'importe',
      'ratePerNight', 'nightlyRate', 'currency', 'discount', 'descuento',
    ]) {
      const r = await atacar({ ...legitima(), [campo]: 1 })
      expect({ campo, rechazado: r.rechazado }).toEqual({ campo, rechazado: true })
    }
  })

  it('🔴 tampoco dentro de la línea de habitación, que es donde nace el precio', async () => {
    for (const campo of ['price', 'ratePerNight', 'total', 'rateSnapshot']) {
      const cuerpo = legitima()
      ;(cuerpo.rooms[0] as Record<string, unknown>)[campo] = 1
      expect({ campo, rechazado: (await atacar(cuerpo)).rechazado })
        .toEqual({ campo, rechazado: true })
    }
  })

  // ── Ataque 2: desviar el dinero ───────────────────────────────────────────
  it('🔴 NO se puede mandar a dónde va el dinero', async () => {
    // Todavía no hay cobro, así que esto no defiende nada HOY. Se escribe
    // ahora para que el día que se conecte la pasarela, añadir el campo al
    // cuerpo ponga la prueba en rojo y obligue a justificarlo.
    for (const campo of [
      'destination', 'transfer_data', 'transferData', 'stripeAccount',
      'connectedAccountId', 'cuentaDestino', 'application_fee_amount', 'onBehalfOf',
    ]) {
      const r = await atacar({ ...legitima(), [campo]: 'acct_atacante' })
      expect({ campo, rechazado: r.rechazado }).toEqual({ campo, rechazado: true })
    }
  })

  // ── Ataque 3: cruzar la frontera del inquilino ────────────────────────────
  it('no se puede fijar la property ni la organización desde el cuerpo', async () => {
    // La property se deriva del slug o de la API key, nunca del cuerpo. Si
    // alguien pudiera mandarla, escribiría reservas en el hotel de al lado.
    for (const campo of ['propertyId', 'organizationId', 'property', 'slug']) {
      expect({ campo, rechazado: (await atacar({ ...legitima(), [campo]: 'otro' })).rechazado })
        .toEqual({ campo, rechazado: true })
    }
  })

  // ── Ataque 4: saltarse el estado del negocio ──────────────────────────────
  it('no se puede nacer pagado ni confirmado', async () => {
    for (const campo of ['paymentStatus', 'amountPaid', 'status', 'confirmed', 'holdExpiresAt']) {
      expect({ campo, rechazado: (await atacar({ ...legitima(), [campo]: 'PAID' })).rechazado })
        .toEqual({ campo, rechazado: true })
    }
  })

  // ── Ataque 5: abuso por volumen ───────────────────────────────────────────
  it('un grupo desmesurado se rechaza: es el techo anti-abuso del array', async () => {
    const cuerpo = legitima()
    cuerpo.rooms = Array.from({ length: 21 }, () => legitima().rooms[0])
    expect((await atacar(cuerpo)).rechazado).toBe(true)
  })

  it('ocupación absurda se rechaza', async () => {
    for (const adults of [0, -1, 1.5]) {
      const cuerpo = legitima()
      ;(cuerpo.rooms[0] as Record<string, unknown>).adults = adults
      expect({ adults, rechazado: (await atacar(cuerpo)).rechazado })
        .toEqual({ adults, rechazado: true })
    }
  })

  it('fechas que no son fechas se rechazan', async () => {
    for (const checkIn of ['no-es-fecha', '2026-13-45', '']) {
      const cuerpo = legitima()
      ;(cuerpo.rooms[0] as Record<string, unknown>).checkIn = checkIn
      expect({ checkIn, rechazado: (await atacar(cuerpo)).rechazado })
        .toEqual({ checkIn, rechazado: true })
    }
  })

  // ── El invariante estructural ─────────────────────────────────────────────
  it('🔑 el contrato del cliente NO contiene dinero, y eso se afirma explícitamente', async () => {
    // Una lista blanca protege por lo que NO declara, así que la afirmación
    // útil es sobre el conjunto completo de campos aceptados. Si alguien añade
    // uno, esta prueba lo obliga a verlo aquí.
    const aceptado = (await pipe.transform(
      { ...legitima(), notes: 'hola' },
      meta,
    )) as Record<string, unknown>

    expect(Object.keys(aceptado).sort()).toEqual(['guest', 'notes', 'rooms'])
    expect(Object.keys(aceptado.guest as object).sort()).toEqual(['email', 'name'])
    expect(Object.keys((aceptado.rooms as object[])[0]).sort())
      .toEqual(['adults', 'checkIn', 'checkOut', 'roomTypeId'])
  })
})

/**
 * 🦷 EL HUECO DE LA PRUEBA DE ARRIBA, CERRADO.
 *
 * Las pruebas anteriores construyen su propio `ValidationPipe` con
 * `forbidNonWhitelisted: true`. Si mañana alguien quita esa opción de
 * `main.ts`, **la aplicación quedaría abierta y esas diez pruebas seguirían en
 * verde**, porque no leen `main.ts`: lo imitan.
 *
 * Es el mismo fallo que ya nos costó dos veces: un guardián que no falla porque
 * no está mirando donde importa. Aquí se mira el archivo de verdad.
 */
describe('🔒 la aplicación real usa lista blanca', () => {
  const leer = (ruta: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync(require('path').join(__dirname, ruta), 'utf-8') as string

  it('main.ts activa forbidNonWhitelisted y whitelist', () => {
    const main = leer('../../main.ts')
    expect(main).toContain('whitelist: true')
    expect(main).toContain('forbidNonWhitelisted: true')
  })

  it('🔴 el tipo de habitación se busca ACOTADO a la property', () => {
    // Sin `propertyId` en el `where`, un `roomTypeId` de otro hotel crearía una
    // reserva en el hotel equivocado — IDOR de manual (OWASP API1:2023).
    // Se comprueba el texto porque el `where` es lo que hay que proteger y no
    // hay forma barata de observarlo sin base de datos.
    const svc = leer('../public-reservations.service.ts')
    expect(svc).toMatch(/where:\s*\{\s*id:\s*line\.roomTypeId,\s*propertyId:\s*property\.id/)
  })

  it('🔴 el importe guardado sale del cálculo del servidor, no del cuerpo', () => {
    const svc = leer('../public-reservations.service.ts')
    // `r` es la línea RESUELTA por el servidor; `dto` es lo que mandó el cliente.
    expect(svc).toMatch(/totalAmount:\s*new Prisma\.Decimal\(r\.total\)/)
    expect(svc).toMatch(/ratePerNight:\s*new Prisma\.Decimal\(r\.nightlyRate\)/)
    // Y lo que NO puede aparecer nunca: un importe leído del cuerpo.
    expect(svc).not.toMatch(/totalAmount:.*dto\./)
    expect(svc).not.toMatch(/ratePerNight:.*dto\./)
  })
})
