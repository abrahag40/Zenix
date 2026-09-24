import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrepararPagoDto } from './pago.dto'
import { PagoDeReservaService } from './pago-de-reserva.service'
import { PAGO_DE_HUESPED_AUTORIZADO, PAGO_DE_HUESPED_FALLIDO } from '../../common/events/pago-de-huesped'

/**
 * El camino del dinero, mirado por un atacante.
 *
 * La pregunta que responden estas pruebas no es «¿funciona?» sino **«¿puede
 * alguien cobrar de menos, cobrar a otra cuenta, o confirmar una reserva sin
 * pagar?»**. Cada `it` es un intento concreto de hacerlo.
 */

// ── Dobles ────────────────────────────────────────────────────────────────

function hacerServicio(over: {
  reserva?: Record<string, unknown> | null
  update?: jest.Mock
} = {}) {
  const update = over.update ?? jest.fn().mockResolvedValue({})
  const prisma = {
    guestStay: {
      findFirst: jest.fn().mockResolvedValue(
        'reserva' in over
          ? over.reserva
          : {
              id: 'st1',
              totalAmount: 8323.59,
              currency: 'MXN',
              cancelledAt: null,
              paymentStatus: 'UNPAID',
              holdExpiresAt: new Date(),
            },
      ),
      update,
    },
  } as never
  const billing = { getStripeClient: () => null } as never
  return { svc: new PagoDeReservaService(prisma, billing), update, prisma }
}

// ── 1 · El importe no se puede mandar ─────────────────────────────────────

describe('el cliente no decide cuánto paga', () => {
  it('🔴 `crearIntento` no acepta ningún importe — sobre la firma real', () => {
    const fuente = readFileSync(join(__dirname, 'pago-de-reserva.service.ts'), 'utf8')
    const firma = fuente.slice(fuente.indexOf('async crearIntento('), fuente.indexOf('}): Promise<{'))
    for (const prohibido of ['amount', 'importe', 'monto', 'total', 'precio', 'destino', 'account']) {
      expect(firma.toLowerCase()).not.toContain(prohibido)
    }
  })

  it('🔴 el DTO rechaza `amount` en el cuerpo (whitelist, no blacklist)', () => {
    const dto = plainToInstance(PrepararPagoDto, { medio: 'TARJETA', amount: 1 })
    // `forbidNonWhitelisted` es lo que convierte el campo de más en un 400;
    // aquí se comprueba el efecto con la misma opción que usa `main.ts`.
    const errores = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })
    expect(errores.map((e) => e.property)).toContain('amount')
  })

  it('el DTO acepta un medio válido y rechaza uno inventado', () => {
    expect(validateSync(plainToInstance(PrepararPagoDto, { medio: 'TARJETA' }))).toHaveLength(0)
    expect(validateSync(plainToInstance(PrepararPagoDto, { medio: 'GRATIS' }))).not.toHaveLength(0)
  })
})

// ── 2 · Confirmar sólo con el importe correcto ────────────────────────────

describe('confirmarPorPago', () => {
  const base = { bookingRef: 'MX-W-1', propertyId: 'p1' }

  it('confirma cuando el importe autorizado es el de la reserva', async () => {
    const { svc, update } = hacerServicio()
    await expect(
      svc.confirmarPorPago({ ...base, importeCentavos: 832359, moneda: 'MXN' }),
    ).resolves.toEqual({ confirmada: true })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) }),
    )
  })

  it('🔴 un peso de menos NO confirma', async () => {
    const { svc, update } = hacerServicio()
    const r = await svc.confirmarPorPago({ ...base, importeCentavos: 832259, moneda: 'MXN' })
    expect(r.confirmada).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('🔴 el importe correcto en OTRA moneda no confirma', async () => {
    const { svc, update } = hacerServicio()
    const r = await svc.confirmarPorPago({ ...base, importeCentavos: 832359, moneda: 'USD' })
    expect(r.confirmada).toBe(false)
    expect(r.motivo).toMatch(/moneda/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('🔴 una reserva ya cancelada no se resucita: se marca para devolución', async () => {
    const { svc, update } = hacerServicio({
      reserva: { id: 'st1', totalAmount: 8323.59, currency: 'MXN', cancelledAt: new Date(), paymentStatus: 'UNPAID' },
    })
    const r = await svc.confirmarPorPago({ ...base, importeCentavos: 832359, moneda: 'MXN' })
    expect(r.confirmada).toBe(false)
    expect(r.motivo).toMatch(/devoluci/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('es idempotente: la segunda vez no vuelve a escribir', async () => {
    const { svc, update } = hacerServicio({
      reserva: { id: 'st1', totalAmount: 8323.59, currency: 'MXN', cancelledAt: null, paymentStatus: 'PAID' },
    })
    await expect(
      svc.confirmarPorPago({ ...base, importeCentavos: 832359, moneda: 'MXN' }),
    ).resolves.toEqual({ confirmada: true })
    expect(update).not.toHaveBeenCalled()
  })

  it('una referencia que no existe no confirma nada', async () => {
    const { svc } = hacerServicio({ reserva: null })
    const r = await svc.confirmarPorPago({ ...base, importeCentavos: 832359 })
    expect(r.confirmada).toBe(false)
  })
})

// ── 3 · El fallo suelta la retención ──────────────────────────────────────

describe('cuando el pago falla', () => {
  it('adelanta la caducidad en vez de cancelar a mano', async () => {
    const { svc, update } = hacerServicio()
    await svc.alFallarPago({ bookingRef: 'MX-W-1', propertyId: 'p1', paymentIntentId: 'pi_1', motivo: 'tarjeta rechazada' })
    expect(update).toHaveBeenCalledTimes(1)
    const datos = update.mock.calls[0][0].data
    expect(datos.holdExpiresAt).toBeInstanceOf(Date)
    // Nada de cancelar aquí: eso lo hace el liberador, en un solo sitio.
    expect(datos).not.toHaveProperty('cancelledAt')
  })

  it('sin retención que soltar no toca nada', async () => {
    const { svc, update } = hacerServicio({
      reserva: { id: 'st1', holdExpiresAt: null },
    })
    await svc.alFallarPago({ bookingRef: 'MX-W-1', propertyId: 'p1', paymentIntentId: 'pi_1', motivo: 'x' })
    expect(update).not.toHaveBeenCalled()
  })
})

// ── 4 · Funciones de aptitud sobre el webhook ─────────────────────────────

describe('funciones de aptitud del camino del pago', () => {
  const webhook = readFileSync(
    join(__dirname, '..', '..', 'billing', 'webhook-handler.service.ts'),
    'utf8',
  )

  it('🔴 el webhook maneja `amount_capturable_updated` — el evento de la autorización', () => {
    // Con `capture_method: manual`, `succeeded` sólo llega al capturar. Si
    // sólo se escuchara ése, la reserva nunca pasaría a firme.
    expect(webhook).toContain("case 'payment_intent.amount_capturable_updated':")
  })

  it('🔴 el webhook ignora los intents sin `bookingRef`', () => {
    // Sin este filtro, un pago de suscripción del hotel podría intentar
    // confirmar una reserva inexistente.
    expect(webhook).toMatch(/if \(!bookingRef \|\| !propertyId\)/)
  })

  it('🔴 la confirmación entra por el evento, no por una ruta HTTP', () => {
    const ctrl = readFileSync(join(__dirname, '..', 'public-booking.controller.ts'), 'utf8')
    for (const prohibido of ['confirmarPorPago', 'paymentStatus', "'PAID'"]) {
      expect(ctrl).not.toContain(prohibido)
    }
  })

  it('el oyente y el emisor usan la misma constante', () => {
    const servicio = readFileSync(join(__dirname, 'pago-de-reserva.service.ts'), 'utf8')
    for (const evento of [PAGO_DE_HUESPED_AUTORIZADO, PAGO_DE_HUESPED_FALLIDO]) {
      expect(evento).toMatch(/^huesped\.pago\./)
    }
    expect(servicio).toContain('@OnEvent(PAGO_DE_HUESPED_AUTORIZADO)')
    expect(webhook).toContain('emitAsync(PAGO_DE_HUESPED_AUTORIZADO')
  })

  it('🔴 el webhook ESPERA a los oyentes antes de responder 2xx a Stripe', () => {
    // Con `emit` a secas, Stripe recibiría el 2xx aunque la confirmación
    // reventara, y no reintentaría nunca. Tiene que ser `await emitAsync`.
    expect(webhook).toContain('await this.eventos.emitAsync(PAGO_DE_HUESPED_AUTORIZADO')
  })
})
