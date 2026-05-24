/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7 unit tests.
 *
 * ChannelPausesService cubre:
 *   · pause happy path — snapshot preState + emit event + persist row + audit
 *   · pause when ya está pausado → ConflictException
 *   · pause property sin rate plans → BadRequest
 *   · pause property sin channexPropertyId → BadRequest
 *   · unpause happy path — restore from preState + emit event
 *   · unpause de pause ya despausado → ConflictException
 *   · unpause de pause inexistente → NotFound
 */
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ChannelPausesService } from './channel-pauses.service'
import { CHANNEX_RESTRICTION_UPDATED } from '../../../integrations/channex/outbound/channex-outbound-events'

describe('ChannelPausesService — Day 7', () => {
  const PROPERTY_ID = 'prop-1'
  const CHANNEX_PROPERTY_ID = 'channex-prop-1'
  const ORG_ID = 'org-1'
  const ACTOR_ID = 'user-1'
  const CHANNEL_ID = 'channex-channel-booking-com'
  const CHANNEL_NAME = 'booking_com'

  function build(opts: {
    propertyExists?: boolean
    channexPropertyId?: string | null
    existingPause?: any
    mappings?: any[]
    listRestrictions?: { fromChannex: boolean; rows: any[] }[]
    pauseRow?: any
  } = {}) {
    const prisma: any = {
      property: { findFirst: jest.fn() },
      propertySettings: { findUnique: jest.fn() },
      channexRatePlanMapping: { findMany: jest.fn() },
      channexChannelPause: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
    }
    prisma.property.findFirst.mockResolvedValue(
      opts.propertyExists === false ? null : { id: PROPERTY_ID },
    )
    prisma.propertySettings.findUnique.mockResolvedValue({
      channexPropertyId: opts.channexPropertyId === undefined ? CHANNEX_PROPERTY_ID : opts.channexPropertyId,
    })
    prisma.channexRatePlanMapping.findMany.mockResolvedValue(opts.mappings ?? [])
    prisma.channexChannelPause.findFirst.mockResolvedValue(opts.existingPause ?? opts.pauseRow ?? null)
    prisma.channexChannelPause.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'pause-1', ...args.data }),
    )
    prisma.channexChannelPause.update.mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...opts.pauseRow, ...args.data }),
    )

    const gateway: any = {
      listRestrictions: jest.fn(),
    }
    const restrictions = opts.listRestrictions ?? []
    restrictions.forEach((r) => gateway.listRestrictions.mockResolvedValueOnce(r))
    gateway.listRestrictions.mockResolvedValue({ fromChannex: true, rows: [] })

    const tenant: any = { getActingOrgIdOrThrow: jest.fn().mockReturnValue(ORG_ID) }
    const events = new EventEmitter2()
    jest.spyOn(events, 'emit')
    const auditLog: any = { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) }

    const service = new ChannelPausesService(prisma, tenant, gateway, events, auditLog)
    return { service, prisma, gateway, events, auditLog }
  }

  describe('pause', () => {
    it('happy path — emite event con stop_sell=true + persiste row + audit', async () => {
      const mappings = [
        { channexRatePlanId: 'rp-1', title: 'BAR Estándar' },
        { channexRatePlanId: 'rp-2', title: 'BAR Suite' },
      ]
      const { service, events, prisma, auditLog } = build({ mappings })

      const result = await service.pause(
        PROPERTY_ID,
        CHANNEL_ID,
        CHANNEL_NAME,
        'Mantenimiento lobby 3 días',
        ACTOR_ID,
        'PLATFORM_ADMIN',
        undefined,
        'Verificación Day 7',
      )

      expect(result.id).toBe('pause-1')
      // Event emitido con 2 entries (uno por rate plan), stopSell:true
      expect(events.emit).toHaveBeenCalledWith(
        CHANNEX_RESTRICTION_UPDATED,
        expect.objectContaining({
          propertyId: CHANNEX_PROPERTY_ID,
          entries: expect.arrayContaining([
            expect.objectContaining({ ratePlanId: 'rp-1', stopSell: true }),
            expect.objectContaining({ ratePlanId: 'rp-2', stopSell: true }),
          ]),
        }),
      )
      // Pause row persisted con preState
      expect(prisma.channexChannelPause.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            propertyId: PROPERTY_ID,
            channexChannelId: CHANNEL_ID,
            channelName: CHANNEL_NAME,
            pausedById: ACTOR_ID,
            preState: expect.any(Object),
          }),
        }),
      )
      // Audit PERMANENT retention
      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHANNEX_CHANNEL_PAUSE',
          status: 'SUCCESS',
          retentionPolicy: 'PERMANENT',
        }),
      )
    })

    it('rechaza si ya hay pause activo (no doble pause)', async () => {
      const { service } = build({
        existingPause: { id: 'existing-pause', pausedAt: new Date('2026-05-23'), unpausedAt: null },
        mappings: [{ channexRatePlanId: 'rp-1', title: 'BAR' }],
      })
      await expect(
        service.pause(PROPERTY_ID, CHANNEL_ID, CHANNEL_NAME, undefined, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(ConflictException)
    })

    it('rechaza si property sin rate plans', async () => {
      const { service } = build({ mappings: [] })
      await expect(
        service.pause(PROPERTY_ID, CHANNEL_ID, CHANNEL_NAME, undefined, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(/no tiene rate plans/)
    })

    it('rechaza si property sin channexPropertyId', async () => {
      const { service } = build({ channexPropertyId: null, mappings: [{ channexRatePlanId: 'rp-1', title: 'BAR' }] })
      await expect(
        service.pause(PROPERTY_ID, CHANNEL_ID, CHANNEL_NAME, undefined, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(BadRequestException)
    })

    it('captura preState con stop_sell existentes en Channex', async () => {
      const mappings = [{ channexRatePlanId: 'rp-1', title: 'BAR' }]
      const { service, prisma } = build({
        mappings,
        listRestrictions: [
          {
            fromChannex: true,
            rows: [
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-13', stop_sell: true },
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-14', stop_sell: false },
            ],
          },
        ],
      })
      await service.pause(PROPERTY_ID, CHANNEL_ID, CHANNEL_NAME, undefined, ACTOR_ID, 'PLATFORM_ADMIN')
      const createCall = prisma.channexChannelPause.create.mock.calls[0][0]
      expect(createCall.data.preState).toEqual({
        'rp-1': { '2026-06-13': true, '2026-06-14': false },
      })
    })
  })

  describe('unpause', () => {
    it('happy path — restore preState + emit event con stop_sell=false', async () => {
      const pauseRow = {
        id: 'pause-1',
        propertyId: PROPERTY_ID,
        channexChannelId: CHANNEL_ID,
        channelName: CHANNEL_NAME,
        unpausedAt: null,
        preState: { 'rp-1': { '2026-06-13': true } }, // viernes 13 estaba bloqueado pre-pause
      }
      const { service, events } = build({ pauseRow })

      const result = await service.unpause(
        PROPERTY_ID,
        'pause-1',
        'Mantenimiento listo',
        ACTOR_ID,
        'PLATFORM_ADMIN',
      )

      expect(result.unpausedAt).toBeDefined()
      expect(events.emit).toHaveBeenCalledWith(
        CHANNEX_RESTRICTION_UPDATED,
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ ratePlanId: 'rp-1', stopSell: false }), // open everything first
            expect.objectContaining({ ratePlanId: 'rp-1', date: '2026-06-13', stopSell: true }), // re-apply prev
          ]),
        }),
      )
    })

    it('rechaza unpause de pause ya despausado', async () => {
      const pauseRow = {
        id: 'pause-1',
        propertyId: PROPERTY_ID,
        unpausedAt: new Date('2026-05-23'),
        preState: {},
      }
      const { service } = build({ pauseRow })
      await expect(
        service.unpause(PROPERTY_ID, 'pause-1', undefined, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(ConflictException)
    })

    it('rechaza unpause de pause inexistente', async () => {
      const { service } = build({})
      await expect(
        service.unpause(PROPERTY_ID, 'pause-fantasma', undefined, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(NotFoundException)
    })
  })
})
