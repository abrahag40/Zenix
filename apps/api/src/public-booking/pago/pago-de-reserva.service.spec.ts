import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PagoDeReservaService } from './pago-de-reserva.service'

/**
 * 🔴 Estas pruebas defienden las dos cosas que el cliente NUNCA decide:
 * **cuánto** se cobra y **a dónde** va el dinero.
 *
 * La primera se comprueba con aserciones. La segunda **por construcción**: el
 * método no tiene parámetro de importe ni de destino, y la última prueba lo
 * afirma leyendo la firma real — porque un parámetro que no existe es la única
 * garantía que nadie puede saltarse por descuido.
 */
describe('PagoDeReservaService', () => {
  const reserva = {
    id: 'stay-1',
    bookingRef: 'MX-W-000-2609-0001',
    totalAmount: 2400,
    currency: 'MXN',
    paymentStatus: 'PENDING',
    guestEmail: 'maria@example.com',
    cancelledAt: null,
  }

  const arma = (over: { reserva?: unknown; stripe?: unknown } = {}) => {
    const create = jest.fn().mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret_abc' })
    const update = jest.fn().mockResolvedValue({})
    const prisma: any = {
      bookingEngineConfig: {
        findUnique: jest.fn().mockResolvedValue({
          propertyId: 'prop-1', holdTtlMinutes: 1440, displayCurrency: 'MXN',
        }),
      },
      guestStay: {
        findFirst: jest.fn().mockResolvedValue('reserva' in over ? over.reserva : reserva),
        update,
      },
    }
    // `'stripe' in over` y no `??`: `null ?? x` devuelve `x`, así que el doble
    // nunca llegaba a simular «sin Stripe». La prueba estaba mal, no el código.
    // 🔴 El doble es ahora la PASARELA, no Stripe. Y eso es el aprendizaje del
    // cambio: estas pruebas afirmaban cosas sobre `paymentIntents.create`, o
    // sea sobre el proveedor. Ahora afirman sobre el puerto, que es lo que el
    // motor promete — y por eso seguirán valiendo cuando la pasarela sea otra.
    const billing: any = {
      getStripeClient: () => ('stripe' in over ? over.stripe : { paymentIntents: { create } }),
    }
    const pasarela: any = {
      nombre: 'stripe',
      confirmacion: 'webhook-firmado',
      disponible: async () => ('stripe' in over ? !!over.stripe : true),
      prepararCobro: async (d: any) => {
        const pi = await create(
          {
            amount: d.importeCentavos,
            currency: String(d.moneda).toLowerCase(),
            capture_method: 'manual',
            metadata: { bookingRef: d.bookingRef, propertyId: d.propertyId },
          },
          { idempotencyKey: `pi:${d.propertyId}:${d.bookingRef}` },
        )
        return {
          referenciaExterna: pi.id,
          instruccion: { tipo: 'elementos-incrustados', secretoDeCliente: pi.client_secret },
        }
      },
      consultarEstado: async () => ({ autorizado: true, importeCentavos: 0, moneda: 'MXN' }),
    }
    return { service: new PagoDeReservaService(prisma, pasarela), create, update, pasarela }
  }

  it('🔴 el importe sale de la RESERVA, en centavos enteros', async () => {
    const { service, create } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(create.mock.calls[0][0].amount).toBe(240000) // 2 400.00 → centavos
    expect(create.mock.calls[0][0].currency).toBe('mxn')
    expect(r.importeCentavos).toBe(240000)
  })

  it('🔑 al navegador NO le llega nada que pueda mover el dinero', async () => {
    const { service } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    // La lista se afirma entera —y no «que contenga»— para que añadir un campo
    // obligue a pasar por aquí. Este mismo test cazó la llegada de
    // `instruccion`, que es exactamente lo que se le pide.
    expect(Object.keys(r).sort()).toEqual([
      'clientSecret', 'expiraEn', 'importeCentavos', 'instruccion', 'moneda',
    ])
    // Y la garantía de fondo, que NO depende de la lista: ni cuentas destino,
    // ni ids de Stripe, ni llaves — mire donde mire, incluida la instrucción.
    expect(JSON.stringify(r)).not.toMatch(/acct_|sk_|transfer_data|destination/)
  })

  it('🔴 la instrucción para el navegador no lleva importe editable ni destino', async () => {
    const { service } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    // Con elementos incrustados sólo viaja la capacidad. Si algún día una
    // pasarela devolviera un formulario, el motor exige `firmado: true` — y
    // hay otra prueba para eso.
    expect(r.instruccion.tipo).toBe('elementos-incrustados')
    expect(Object.keys(r.instruccion).sort()).toEqual(['secretoDeCliente', 'tipo'])
  })

  it('🔴 se NIEGA a devolver un formulario sin firmar', async () => {
    // El importe en un campo oculto sin firma es un importe que el navegador
    // edita con dos clics. Es el escenario de Banorte Payworks sin la variante
    // cifrada, y por eso la comprobación existe ANTES de que exista el
    // adaptador.
    const { service, pasarela } = arma()
    pasarela.prepararCobro = async () => ({
      referenciaExterna: 'ref-1',
      instruccion: {
        tipo: 'redirigir',
        url: 'https://eps.ejemplo.com/recibo',
        campos: { monto: '2400.00' },
        firmado: false,
        metodo: 'POST',
      },
    })
    await expect(
      service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef }),
    ).rejects.toThrow(/sin firmar|editable/i)
  })

  it('🔴 autoriza sin cobrar: capture_method manual', async () => {
    const { service, create } = arma()
    await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(create.mock.calls[0][0].capture_method).toBe('manual')
  })

  it('un doble clic no crea dos intenciones de pago', async () => {
    const { service, create } = arma()
    await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(create.mock.calls[0][1].idempotencyKey).toBe(`pi:prop-1:${reserva.bookingRef}`)
  })

  it('la referencia viaja en los metadatos, para que el webhook sepa qué confirmar', async () => {
    const { service, create } = arma()
    await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(create.mock.calls[0][0].metadata)
      .toEqual({ bookingRef: reserva.bookingRef, propertyId: 'prop-1' })
  })

  it('🔑 la retención empieza al PAGAR, y con tarjeta no pasa del techo', async () => {
    const { service, update } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(update.mock.calls[0][0].data).toHaveProperty('holdExpiresAt')
    // La config pide 1440 min; la política de tarjeta lo corta en 60.
    const minutos = (new Date(r.expiraEn!).getTime() - Date.now()) / 60_000
    expect(minutos).toBeGreaterThan(50)
    expect(minutos).toBeLessThanOrEqual(61)
  })

  it('pagar en el hotel no retiene nada', async () => {
    const { service, update } = arma()
    const r = await service.crearIntento({
      slug: 'hotel-tulum', bookingRef: reserva.bookingRef, medio: 'EN_EL_HOTEL',
    })
    expect(r.expiraEn).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('sin Stripe configurado se dice, no se revienta', async () => {
    const { service } = arma({ stripe: null })
    await expect(service.crearIntento({ slug: 'x', bookingRef: 'y' }))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('una reserva que no existe no crea ninguna intención', async () => {
    const { service, create } = arma({ reserva: null })
    await expect(service.crearIntento({ slug: 'hotel-tulum', bookingRef: 'no' }))
      .rejects.toBeInstanceOf(NotFoundException)
    expect(create).not.toHaveBeenCalled()
  })

  it('una reserva ya pagada no se vuelve a cobrar', async () => {
    const { service, create } = arma({ reserva: { ...reserva, paymentStatus: 'PAID' } })
    await expect(service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef }))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  // ── La confirmación, que sólo llega del webhook ───────────────────────────
  it('confirma cuando el importe autorizado coincide', async () => {
    const { service, update } = arma()
    const r = await service.confirmarPorPago({
      bookingRef: reserva.bookingRef, propertyId: 'prop-1', importeCentavos: 240000,
    })
    expect(r.confirmada).toBe(true)
    expect(update.mock.calls[0][0].data)
      .toMatchObject({ paymentStatus: 'PAID', holdExpiresAt: null })
  })

  it('🔴 si el importe NO coincide, no se confirma', async () => {
    const { service, update } = arma()
    const r = await service.confirmarPorPago({
      bookingRef: reserva.bookingRef, propertyId: 'prop-1', importeCentavos: 100,
    })
    expect(r.confirmada).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('🔴 una reserva ya CANCELADA no se resucita al pagar', async () => {
    // La retención caducó y el liberador la soltó: la habitación puede estar
    // vendida a otro. Resucitarla sería sobrevender.
    const { service, update } = arma({ reserva: { ...reserva, cancelledAt: new Date() } })
    const r = await service.confirmarPorPago({
      bookingRef: reserva.bookingRef, propertyId: 'prop-1', importeCentavos: 240000,
    })
    expect(r.confirmada).toBe(false)
    expect(r.motivo).toMatch(/devolución/)
    expect(update).not.toHaveBeenCalled()
  })

  it('confirmar dos veces el mismo pago es inofensivo', async () => {
    const { service, update } = arma({ reserva: { ...reserva, paymentStatus: 'PAID' } })
    const r = await service.confirmarPorPago({
      bookingRef: reserva.bookingRef, propertyId: 'prop-1', importeCentavos: 240000,
    })
    expect(r.confirmada).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('🔑 `crearIntento` NO tiene parámetro de importe ni de destino', () => {
    const fuente = PagoDeReservaService.prototype.crearIntento.toString()
    const firma = fuente.slice(0, fuente.indexOf(')') + 1).toLowerCase()
    for (const prohibido of ['amount', 'importe', 'total', 'destination', 'cuenta', 'transfer']) {
      expect(firma).not.toContain(prohibido)
    }
  })
})
