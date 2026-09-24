import { LiberadorDeRetencionesService } from './liberador-de-retenciones.service'

/**
 * 🔴 LA PRUEBA QUE DECIDE SI COBRAR ES SEGURO es la de la carrera: el aviso
 * del pago llega mientras el liberador está corriendo.
 *
 * Se resuelve con concurrencia optimista, no con un cerrojo. Confirmar un pago
 * pone `holdExpiresAt = NULL`; la condición del `updateMany` vuelve a exigir
 * que NO sea nulo, así que si el pago ganó se actualizan cero filas y la
 * reserva sobrevive. Si ganó el liberador, el confirmador verá la reserva
 * cancelada y devolverá el dinero. En ningún orden se pierde dinero ni se
 * vende dos veces.
 */
describe('LiberadorDeRetencionesService', () => {
  const retencion = {
    id: 'stay-1',
    roomId: 'room-1',
    checkinAt: new Date('2026-11-01T00:00:00Z'),
    scheduledCheckout: new Date('2026-11-04T00:00:00Z'),
    bookingRef: 'MX-WEB-AZ-2611-0001',
    holdExpiresAt: new Date('2026-10-01T11:00:00Z'),
  }

  const arma = (opts: { candidatas?: unknown[]; filasActualizadas?: number } = {}) => {
    const stayUpdateMany = jest.fn().mockResolvedValue({ count: opts.filasActualizadas ?? 1 })
    const segmentUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
    const prisma: any = {
      guestStay: { findMany: jest.fn().mockResolvedValue(opts.candidatas ?? [retencion]), updateMany: stayUpdateMany },
      staySegment: { updateMany: segmentUpdateMany },
      $transaction: (fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ guestStay: { updateMany: stayUpdateMany }, staySegment: { updateMany: segmentUpdateMany } })),
    }
    const availability = { anunciarCambioDeInventario: jest.fn() }
    const service = new LiberadorDeRetencionesService(prisma, availability as never)
    return { service, prisma, availability, stayUpdateMany, segmentUpdateMany }
  }

  const ahora = new Date('2026-10-01T12:00:00Z')

  // ── La carrera ────────────────────────────────────────────────────────────
  it('🔴 si el pago llegó primero, la reserva SOBREVIVE', async () => {
    // `updateMany` devuelve 0: la condición ya no casa porque confirmar el
    // pago puso `holdExpiresAt = NULL`.
    const { service, availability, segmentUpdateMany } = arma({ filasActualizadas: 0 })

    expect(await service.liberarCaducadas(ahora)).toBe(0)
    // Y sobre todo: NO se cancela su segmento ni se anuncia nada. Anunciar
    // liberación de una habitación que sigue vendida sería peor que callar.
    expect(segmentUpdateMany).not.toHaveBeenCalled()
    expect(availability.anunciarCambioDeInventario).not.toHaveBeenCalled()
  })

  it('la condición del UPDATE vuelve a exigir que la retención siga viva', async () => {
    const { service, stayUpdateMany } = arma()
    await service.liberarCaducadas(ahora)

    const where = stayUpdateMany.mock.calls[0][0].where
    expect(where.id).toBe('stay-1')
    expect(where.holdExpiresAt).toMatchObject({ not: null })
    expect(where.cancelledAt).toBeNull()
  })

  // ── El camino normal ──────────────────────────────────────────────────────
  it('cancela la reserva Y su segmento, y anuncia que se liberó inventario', async () => {
    const { service, availability, stayUpdateMany, segmentUpdateMany } = arma()

    expect(await service.liberarCaducadas(ahora)).toBe(1)

    // No se borra: una retención caducada es historia del negocio.
    expect(stayUpdateMany.mock.calls[0][0].data).toMatchObject({
      cancelledAt: ahora,
      holdExpiresAt: null,
    })
    // El segmento es lo que ocupa inventario: dejarlo PENDING mantendría la
    // habitación bloqueada aunque la reserva figure cancelada.
    expect(segmentUpdateMany.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' })
    expect(segmentUpdateMany.mock.calls[0][0].where.status).toEqual({ in: ['PENDING', 'ACTIVE'] })

    expect(availability.anunciarCambioDeInventario).toHaveBeenCalledWith(
      'room-1', retencion.checkinAt, retencion.scheduledCheckout, 'hold_expired',
    )
  })

  it('la gracia de un minuto protege al que acaba de pagar', async () => {
    const { service, prisma } = arma()
    await service.liberarCaducadas(ahora)

    const corte = prisma.guestStay.findMany.mock.calls[0][0].where.holdExpiresAt.lt
    expect(corte.getTime()).toBe(ahora.getTime() - 60_000)
  })

  it('no toca a quien ya hizo check-in: no tiene retención que soltar', async () => {
    const { service, prisma } = arma()
    await service.liberarCaducadas(ahora)
    expect(prisma.guestStay.findMany.mock.calls[0][0].where.actualCheckin).toBeNull()
  })

  // ── Robustez del trabajo periódico ────────────────────────────────────────
  it('una que falla no impide liberar las demás', async () => {
    const dos = [retencion, { ...retencion, id: 'stay-2', roomId: 'room-2', bookingRef: 'REF-2' }]
    const { service, prisma, availability } = arma({ candidatas: dos })
    let llamada = 0
    prisma.$transaction = (fn: (tx: unknown) => unknown) => {
      llamada++
      if (llamada === 1) return Promise.reject(new Error('base caída un instante'))
      return Promise.resolve(fn({
        guestStay: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        staySegment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      }))
    }

    expect(await service.liberarCaducadas(ahora)).toBe(1)
    expect(availability.anunciarCambioDeInventario).toHaveBeenCalledTimes(1)
  })

  it('sin caducadas no hace ningún trabajo', async () => {
    const { service, prisma, availability } = arma({ candidatas: [] })
    expect(await service.liberarCaducadas(ahora)).toBe(0)
    expect(prisma.guestStay.updateMany).not.toHaveBeenCalled()
    expect(availability.anunciarCambioDeInventario).not.toHaveBeenCalled()
  })

  it('una pasada rota NO tumba el proceso: la siguiente reintenta', async () => {
    const { service, prisma } = arma()
    prisma.guestStay.findMany = jest.fn().mockRejectedValue(new Error('base caída'))
    await expect(service.correr()).resolves.toBeUndefined()
  })

  it('pone techo por pasada: el trabajo periódico no monopoliza la base', async () => {
    const { service, prisma } = arma()
    await service.liberarCaducadas(ahora)
    expect(prisma.guestStay.findMany.mock.calls[0][0].take).toBe(200)
    // La más vencida primero: si hay más de las que caben, se atiende antes a
    // quien lleva más tiempo bloqueando una habitación.
    expect(prisma.guestStay.findMany.mock.calls[0][0].orderBy).toEqual({ holdExpiresAt: 'asc' })
  })
})
