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
    const billing: any = {
      getStripeClient: () => ('stripe' in over ? over.stripe : { paymentIntents: { create } }),
    }
    return { service: new PagoDeReservaService(prisma, billing), create, update }
  }

  it('🔴 el importe sale de la RESERVA, en centavos enteros', async () => {
    const { service, create } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(create.mock.calls[0][0].amount).toBe(240000) // 2 400.00 → centavos
    expect(create.mock.calls[0][0].currency).toBe('mxn')
    expect(r.importeCentavos).toBe(240000)
  })

  it('🔑 al navegador le llega SÓLO el client_secret', async () => {
    const { service } = arma()
    const r = await service.crearIntento({ slug: 'hotel-tulum', bookingRef: reserva.bookingRef })
    expect(Object.keys(r).sort()).toEqual(['clientSecret', 'expiraEn', 'importeCentavos', 'moneda'])
    // Nada de cuentas destino, ni ids de Stripe, ni llaves.
    expect(JSON.stringify(r)).not.toMatch(/acct_|sk_|transfer_data|destination/)
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
