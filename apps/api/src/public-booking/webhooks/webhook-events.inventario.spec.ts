import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { AvailabilityService } from '../../pms/availability/availability.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { WebhookDispatcherService } from './webhook-dispatcher.service'
import { WebhookEventsListener } from './webhook-events.listener'

/**
 * El cable completo, de punta a punta y SIN Channex: alguien cambia el
 * inventario → el sitio del hotel recibe `availability.changed`.
 *
 * Las pruebas de `inventory-events.spec.ts` comprueban que el evento sale; las
 * del oyente, que se traduce a webhook. Ninguna de las dos comprueba que
 * **estén conectados** — y un cable suelto entre dos piezas correctas es
 * exactamente el defecto que estamos arreglando. Por eso aquí se monta el
 * `EventEmitter2` de verdad y se deja que el evento viaje.
 */
describe('cableado · cambio de inventario → webhook al sitio del hotel', () => {
  it('🔴 un bloqueo con Channex APAGADO llega al sitio del hotel', async () => {
    const dispatcher = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const prisma: any = {
      room: { findUnique: jest.fn().mockResolvedValue({ propertyId: 'prop-1' }) },
      propertySettings: { findUnique: jest.fn().mockResolvedValue(null) },
      guestStay: { findMany: jest.fn().mockResolvedValue([]) },
      staySegment: { findMany: jest.fn().mockResolvedValue([]) },
      roomBlock: { findMany: jest.fn().mockResolvedValue([]) },
    }

    const mod = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        WebhookEventsListener,
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannexGateway, useValue: { enabled: false } },
        { provide: WebhookDispatcherService, useValue: dispatcher },
      ],
    }).compile()
    await mod.init() // registra los @OnEvent

    const availability = mod.get(AvailabilityService)

    // Lo que hace `BlocksService` cuando el manager bloquea unas noches.
    await availability.computeAndPushInventory('room-1', [
      new Date('2026-10-03T00:00:00Z'),
      new Date('2026-10-04T00:00:00Z'),
    ])

    // @OnEvent async: se entrega fuera del hilo, hay que cederle el turno.
    await new Promise((r) => setImmediate(r))

    expect(dispatcher.enqueue).toHaveBeenCalledTimes(1)
    const [propertyId, evento, carga] = dispatcher.enqueue.mock.calls[0]
    expect(propertyId).toBe('prop-1')
    expect(evento).toBe('availability.changed')
    expect(carga).toMatchObject({ roomId: 'room-1', reason: 'inventory_recompute' })

    await mod.close()
  })

  it('si la habitación ya no existe, el oyente calla en vez de reventar', async () => {
    const dispatcher = { enqueue: jest.fn() }
    const prisma: any = { room: { findUnique: jest.fn().mockResolvedValue(null) } }
    const events = new EventEmitter2()
    const listener = new WebhookEventsListener(dispatcher as never, prisma)

    await listener.onInventoryChanged({
      roomId: 'borrada',
      from: new Date(),
      to: new Date(),
      reason: 'prueba',
    })

    expect(dispatcher.enqueue).not.toHaveBeenCalled()
    expect(events).toBeDefined()
  })
})
