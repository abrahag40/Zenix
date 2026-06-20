/**
 * AvailabilityService.notifyReservation / notifyRelease — Day 3 refactor test.
 *
 * Audit cert AP-2.2: save handlers ya NO llaman Gateway direct. En su lugar
 * emiten `channex.availability.changed` event que el OutboxBuilder captura.
 *
 * Esto desacopla el save handler del HTTP — si Channex está caído, el save
 * commit local NO se bloquea (resilience), y el outbox + worker reintentan
 * con backoff (cert AP-2.3).
 */

import { EventEmitter2 } from '@nestjs/event-emitter'
import { AvailabilityService, ReservationNotification } from './availability.service'
import { CHANNEX_AVAILABILITY_CHANGED } from '../../integrations/channex/outbound/channex-outbound-events'

function makePrismaMock(opts: {
  channexRoomTypeId?: string | null
  channexPropertyId?: string | null
  // CHANNEX-CERT-FIX: el push ahora agrega TODOS los cuartos del room type.
  // Default: 3 cuartos (1 unidad c/u) → totalUnits=3, sin reservas → avail=3.
  rooms?: Array<{ id: string; units: { id: string }[] }>
}) {
  const rooms = opts.rooms ?? [
    { id: 'room-1', units: [{ id: 'u1' }] },
    { id: 'room-2', units: [{ id: 'u2' }] },
    { id: 'room-3', units: [{ id: 'u3' }] },
  ]
  return {
    room: {
      findUnique: jest.fn().mockResolvedValue(
        opts.channexRoomTypeId === undefined
          ? null // simulates room not found
          : {
              propertyId: 'prop-1',
              channexRoomTypeId: opts.channexRoomTypeId,
            },
      ),
      findMany: jest.fn().mockResolvedValue(rooms),
    },
    propertySettings: {
      findUnique: jest.fn().mockResolvedValue(
        opts.channexPropertyId === undefined
          ? null
          : { channexPropertyId: opts.channexPropertyId },
      ),
    },
    guestStay: { findMany: jest.fn().mockResolvedValue([]) },
    staySegment: { findMany: jest.fn().mockResolvedValue([]) },
    roomBlock: { findMany: jest.fn().mockResolvedValue([]) },
  }
}

function makeChannexMock(enabled = true) {
  return {
    enabled,
    pushInventory: jest.fn(),
    pushAbsoluteAvailability: jest.fn(),
  }
}

describe('AvailabilityService.notifyReservation/Release (Day 3 event-driven)', () => {
  let events: EventEmitter2
  let emitSpy: jest.SpyInstance

  beforeEach(() => {
    events = new EventEmitter2()
    emitSpy = jest.spyOn(events, 'emit')
  })

  const baseNotif: ReservationNotification = {
    roomId: 'room-1',
    from: new Date('2026-06-01T00:00:00Z'),
    to: new Date('2026-06-04T00:00:00Z'),
    reason: 'RESERVATION',
    traceId: 'trace-1',
  }

  it('notifyReservation: emite disponibilidad ABSOLUTA agregada del room type (por noche)', async () => {
    const prisma = makePrismaMock({
      channexRoomTypeId: 'chx-rt-1',
      channexPropertyId: 'chx-prop-1',
    })
    const channex = makeChannexMock(true)
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    await svc.notifyReservation(baseNotif)

    // CHANNEX-CERT-FIX: 3 cuartos del tipo, sin reservas mockeadas → avail=3
    // (NO 0). Una entry por NOCHE del rango [01,04) = Jun 1, 2, 3.
    expect(emitSpy).toHaveBeenCalledWith(CHANNEX_AVAILABILITY_CHANGED, {
      propertyId: 'prop-1',
      entries: [
        { propertyId: 'chx-prop-1', roomTypeId: 'chx-rt-1', date: '2026-06-01', availability: 3 },
        { propertyId: 'chx-prop-1', roomTypeId: 'chx-rt-1', date: '2026-06-02', availability: 3 },
        { propertyId: 'chx-prop-1', roomTypeId: 'chx-rt-1', date: '2026-06-03', availability: 3 },
      ],
    })
    // AP-2.2 mitigation: Gateway.pushInventory NUNCA se llama desde aquí
    expect(channex.pushInventory).not.toHaveBeenCalled()
  })

  it('notifyRelease: recalcula absoluto (mismo path idempotente, no delta)', async () => {
    const prisma = makePrismaMock({
      channexRoomTypeId: 'chx-rt-1',
      channexPropertyId: 'chx-prop-1',
    })
    const channex = makeChannexMock(true)
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    await svc.notifyRelease(baseNotif)

    const call = emitSpy.mock.calls[0]
    expect(call[0]).toBe(CHANNEX_AVAILABILITY_CHANGED)
    // 3 cuartos, sin ocupación → 3 disponibles (absoluto correcto, no "1")
    expect(call[1].entries[0].availability).toBe(3)
  })

  it('skip silencioso si Channex disabled (sin api-key)', async () => {
    const prisma = makePrismaMock({
      channexRoomTypeId: 'chx-rt-1',
      channexPropertyId: 'chx-prop-1',
    })
    const channex = makeChannexMock(false) // disabled
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    await svc.notifyReservation(baseNotif)

    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('skip si room sin channexRoomTypeId (no mapeado)', async () => {
    const prisma = makePrismaMock({
      channexRoomTypeId: null,
      channexPropertyId: 'chx-prop-1',
    })
    const channex = makeChannexMock(true)
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    await svc.notifyReservation(baseNotif)

    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('skip si property sin channexPropertyId (no integrada con Channex)', async () => {
    const prisma = makePrismaMock({
      channexRoomTypeId: 'chx-rt-1',
      channexPropertyId: null,
    })
    const channex = makeChannexMock(true)
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    await svc.notifyReservation(baseNotif)

    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('error en DB lookup → log + no emit (resilient, no throw)', async () => {
    const prisma = {
      room: {
        findUnique: jest.fn().mockRejectedValue(new Error('DB down')),
      },
      propertySettings: { findUnique: jest.fn() },
    }
    const channex = makeChannexMock(true)
    const svc = new AvailabilityService(prisma as any, channex as any, events)

    // No throw — el save handler NO se bloquea
    await expect(svc.notifyReservation(baseNotif)).resolves.toBeUndefined()
    expect(emitSpy).not.toHaveBeenCalled()
  })
})
