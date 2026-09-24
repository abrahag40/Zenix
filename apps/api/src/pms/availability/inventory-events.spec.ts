import { EventEmitter2 } from '@nestjs/event-emitter'
import { AvailabilityService } from './availability.service'
import { INVENTORY_CHANGED, type InventoryChangedEvent } from './inventory-events'

/**
 * 🔴 LA PRUEBA DE MORDIDA DE ESTE CAMBIO.
 *
 * El defecto no era que faltara un evento: era que el evento **existía detrás
 * de una guarda de integración**. `computeAndPushInventory` empieza con
 * `if (!this.channex.enabled) return`, así que un hotel sin channel manager
 * bloqueaba habitaciones y su sitio web no se enteraba jamás.
 *
 * Por eso la prueba que manda no comprueba «se emite el evento», sino
 * **«se emite CON CHANNEX APAGADO»**. Con Channex encendido siempre pasó; es
 * justo la configuración del piloto la que estaba descubierta.
 */
describe('inventory.changed — el hecho de dominio', () => {
  const room = { id: 'room-1', propertyId: 'prop-1', channexRoomTypeId: null, units: [{ id: 'u1' }] }

  const arma = (channexEnabled: boolean) => {
    const emitidos: Array<{ nombre: string; carga: InventoryChangedEvent }> = []
    const events = new EventEmitter2()
    events.emit = ((nombre: string, carga: InventoryChangedEvent) => {
      emitidos.push({ nombre, carga })
      return true
    }) as never

    const prisma: any = {
      room: { findUnique: jest.fn().mockResolvedValue(room) },
      propertySettings: { findUnique: jest.fn().mockResolvedValue(null) },
      guestStay: { findMany: jest.fn().mockResolvedValue([]) },
      staySegment: { findMany: jest.fn().mockResolvedValue([]) },
      roomBlock: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const channex: any = { enabled: channexEnabled, pushAvailability: jest.fn() }
    const service = new AvailabilityService(prisma, channex, events)
    return { service, emitidos, prisma }
  }

  const soloInventario = (e: Array<{ nombre: string; carga: InventoryChangedEvent }>) =>
    e.filter((x) => x.nombre === INVENTORY_CHANGED)

  // ── La mordida ────────────────────────────────────────────────────────────
  it('🔴 se emite aunque Channex esté APAGADO — el caso del hotel piloto', async () => {
    const { service, emitidos } = arma(false)
    await service.computeAndPushInventory('room-1', [
      new Date('2026-10-03T00:00:00Z'),
      new Date('2026-10-04T00:00:00Z'),
    ])

    expect(soloInventario(emitidos)).toHaveLength(1)
    const { carga } = soloInventario(emitidos)[0]
    expect(carga.roomId).toBe('room-1')
    expect(carga.reason).toBe('inventory_recompute')
  })

  it('el rango cubre la ÚLTIMA noche entera, no se corta en su medianoche', async () => {
    const { service, emitidos } = arma(false)
    await service.computeAndPushInventory('room-1', [
      new Date('2026-10-03T00:00:00Z'),
      new Date('2026-10-05T00:00:00Z'),
    ])
    const { carga } = soloInventario(emitidos)[0]

    // Intervalo semiabierto [from, to): para que la noche del 5 esté dentro,
    // `to` tiene que ser el 6. Cortar en el 5 dejaría fuera justo la noche que
    // cambió — el error clásico de un día en todo el dominio de hospedaje.
    expect(carga.from.toISOString()).toBe('2026-10-03T00:00:00.000Z')
    expect(carga.to.toISOString()).toBe('2026-10-06T00:00:00.000Z')
  })

  it('las fechas desordenadas no producen un rango invertido', async () => {
    const { service, emitidos } = arma(false)
    await service.computeAndPushInventory('room-1', [
      new Date('2026-10-09T00:00:00Z'),
      new Date('2026-10-03T00:00:00Z'),
      new Date('2026-10-06T00:00:00Z'),
    ])
    const { carga } = soloInventario(emitidos)[0]
    expect(carga.from.getTime()).toBeLessThan(carga.to.getTime())
    expect(carga.from.toISOString()).toBe('2026-10-03T00:00:00.000Z')
    expect(carga.to.toISOString()).toBe('2026-10-10T00:00:00.000Z')
  })

  it('sin fechas no se anuncia nada: un aviso vacío es ruido', async () => {
    const { service, emitidos } = arma(false)
    await service.computeAndPushInventory('room-1', [])
    expect(soloInventario(emitidos)).toHaveLength(0)
  })

  // ── Los otros dos puntos de paso ──────────────────────────────────────────
  it('reservar y liberar anuncian, con Channex apagado', async () => {
    const { service, emitidos } = arma(false)
    const n = {
      roomId: 'room-1',
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-04T00:00:00Z'),
      reason: 'booking_new' as never,
      traceId: 't-1',
    }
    await service.notifyReservation(n)
    await service.notifyRelease(n)

    expect(soloInventario(emitidos)).toHaveLength(2)
  })

  it('un oyente que revienta no tumba la operación que ya se guardó', () => {
    const events = new EventEmitter2()
    events.emit = (() => { throw new Error('oyente roto') }) as never
    const service = new AvailabilityService({} as any, { enabled: false } as any, events)

    expect(() =>
      service.anunciarCambioDeInventario('room-1', new Date(), new Date(), 'prueba'),
    ).not.toThrow()
  })
})
