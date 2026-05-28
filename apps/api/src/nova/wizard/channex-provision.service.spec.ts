/**
 * ChannexProvisionService — unit tests (Day 2).
 *
 * Cobertura:
 *   · Happy path: Group + Property + RoomTypes + RatePlans + Channels
 *   · Idempotency: Property con channexPropertyId existente → no re-create
 *   · Best-effort: failure en createRoomType no aborta, sigue con resto
 *   · Channel credentials encryption (Airbnb requires_oauth, configureLater)
 *   · Org sin channexGroupId → crea Group + persiste
 *   · Org con channexGroupId existente → skip create
 */
import { ChannexProvisionService } from './channex-provision.service'
import type { ChannelCredentialsCryptoService } from './channel-credentials-crypto.service'

const baseActor = {
  sub: 'consultor-test',
  role: 'PLATFORM_ADMIN',
  actorTier: 'PLATFORM',
} as any

function makeCryptoMock(ready = true): ChannelCredentialsCryptoService {
  return {
    isReady: jest.fn().mockReturnValue(ready),
    encrypt: jest.fn().mockReturnValue('encrypted-blob-base64'),
    decrypt: jest.fn().mockReturnValue({}),
    describeCredentials: jest.fn().mockReturnValue('keys=[]'),
  } as any
}

function makeGatewayMock(opts: {
  createPropertyThrows?: boolean
  createRoomTypeThrowsOnSecond?: boolean
  createChannelThrows?: boolean
} = {}) {
  let rtCalls = 0
  return {
    createGroup: jest.fn().mockResolvedValue({ id: 'grp-uuid', title: 't' }),
    createProperty: jest.fn().mockImplementation(async () => {
      if (opts.createPropertyThrows) throw new Error('Channex 422: invalid currency')
      return { id: 'prop-channex-uuid', title: 'X', currency: 'MXN', timezone: 'UTC', country: 'MX' }
    }),
    assignPropertyToGroup: jest.fn().mockResolvedValue(undefined),
    createRoomType: jest.fn().mockImplementation(async () => {
      rtCalls++
      if (opts.createRoomTypeThrowsOnSecond && rtCalls === 2) {
        throw new Error('Channex 422: occ_adults required')
      }
      return { id: `rt-uuid-${rtCalls}`, title: 't', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 }
    }),
    createRatePlan: jest.fn().mockResolvedValue({ id: 'rp-uuid', title: 'BAR', currency: 'MXN', sell_mode: 'per_room', rate_mode: 'manual' }),
    createChannel: jest.fn().mockImplementation(async () => {
      if (opts.createChannelThrows) throw new Error('Channex 422: invalid type')
      return { id: 'chn-uuid', title: 't', channel: 'booking_com', is_active: false }
    }),
  } as any
}

function makePrismaMock(opts: {
  org?: any
  property?: any
  rooms?: any[]
  updatedRooms?: any[]
} = {}) {
  const updateMock = jest.fn().mockResolvedValue({ id: 'updated' })
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue(
        opts.org !== undefined
          ? opts.org
          : { id: 'org-1', name: 'Hotel Test', slug: 'hotel-test', channexGroupId: null },
      ),
      update: jest.fn().mockResolvedValue({ id: 'org-1' }),
    },
    property: {
      findUnique: jest.fn().mockResolvedValue(
        opts.property !== undefined
          ? opts.property
          : {
              id: 'prop-1',
              name: 'Hotel Test Tulum',
              organizationId: 'org-1',
              organization: {
                countryCode: 'MX',
                currency: 'MXN',
                timezone: 'America/Cancun',
              },
              legalEntity: { baseCurrency: 'MXN', countryCode: 'MX' },
              settings: { channexPropertyId: null, timezone: 'America/Cancun' },
              rooms: opts.rooms ?? [
                { id: 'r1', number: '101', channexRoomTypeId: null },
                { id: 'r2', number: '102', channexRoomTypeId: null },
              ],
            },
      ),
    },
    propertySettings: {
      update: updateMock,
      upsert: jest.fn().mockResolvedValue({ id: 'ps-1' }),
    },
    room: {
      update: jest.fn().mockResolvedValue({ id: 'r-updated' }),
      findMany: jest.fn().mockResolvedValue(
        opts.updatedRooms ?? [
          { id: 'r1', number: '101', channexRoomTypeId: 'rt-uuid-1' },
          { id: 'r2', number: '102', channexRoomTypeId: 'rt-uuid-2' },
        ],
      ),
    },
    channel: {
      create: jest.fn().mockResolvedValue({ id: 'ch-row-1' }),
    },
  } as any
}

describe('ChannexProvisionService', () => {
  describe('provisionFromWizard — happy path', () => {
    it('crea Group + Property + RoomTypes + RatePlans + Channel completed', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock()
      const crypto = makeCryptoMock(true)
      const svc = new ChannexProvisionService(prisma, gateway, crypto)
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [
          {
            type: 'BookingCom',
            title: 'Booking.com — Test',
            credentials: { hotel_id: '123', username: 'u', password: 'p' },
            configureLater: false,
          },
        ],
        actor: baseActor,
      })
      expect(result.status).toBe('completed')
      expect(result.groupId).toBe('grp-uuid')
      expect(result.propertiesProvisioned).toBe(1)
      expect(result.roomTypesCreated).toBe(2)
      expect(result.ratePlansCreated).toBe(2)
      expect(result.channelsCreated).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(gateway.createGroup).toHaveBeenCalledTimes(1)
      expect(gateway.createProperty).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Hotel Test Tulum', groupId: 'grp-uuid' }),
      )
      expect(crypto.encrypt).toHaveBeenCalled() // BookingCom credentials encriptadas
    })

    it('Org con channexGroupId existente — skip createGroup', async () => {
      const prisma = makePrismaMock({
        org: { id: 'org-1', name: 'T', slug: 'tt', channexGroupId: 'grp-existing' },
      })
      const gateway = makeGatewayMock()
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      expect(gateway.createGroup).not.toHaveBeenCalled()
      expect(result.groupId).toBe('grp-existing')
    })

    it('Property con channexPropertyId existente — skip createProperty pero asigna a Group', async () => {
      const prisma = makePrismaMock({
        property: {
          id: 'prop-1',
          name: 'P',
          organizationId: 'org-1',
          organization: { countryCode: 'MX', currency: 'MXN', timezone: 'UTC' },
          legalEntity: { baseCurrency: 'MXN', countryCode: 'MX' },
          settings: { channexPropertyId: 'prop-channex-existing', timezone: 'UTC' },
          rooms: [],
        },
      })
      const gateway = makeGatewayMock()
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      expect(gateway.createProperty).not.toHaveBeenCalled()
      expect(gateway.assignPropertyToGroup).toHaveBeenCalledWith(
        'prop-channex-existing',
        'grp-uuid',
      )
    })

    it('Room con channexRoomTypeId existente — skip createRoomType (idempotent)', async () => {
      const prisma = makePrismaMock({
        rooms: [
          { id: 'r1', number: '101', channexRoomTypeId: 'rt-existing-1' }, // skip
          { id: 'r2', number: '102', channexRoomTypeId: null }, // create
        ],
        updatedRooms: [
          { id: 'r2', number: '102', channexRoomTypeId: 'rt-uuid-1' },
        ],
      })
      const gateway = makeGatewayMock()
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      expect(gateway.createRoomType).toHaveBeenCalledTimes(1)
      expect(result.roomTypesCreated).toBe(1)
    })
  })

  describe('error paths — best-effort outside-tx', () => {
    it('createProperty falla → status=failed, errors capturados, NO sigue con rooms', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock({ createPropertyThrows: true })
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      expect(result.status).toBe('failed')
      expect(result.errors[0].step).toBe('create_property')
      expect(gateway.createRoomType).not.toHaveBeenCalled()
    })

    it('createRoomType falla en uno → status=failed para single-property, errors capturados, sigue con resto', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock({ createRoomTypeThrowsOnSecond: true })
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      // 1 RoomType OK + 1 falló dentro de la única Property → la property
      // queda 'partial' a nivel PropertySettings y la org `failed` global
      // porque propertiesProvisioned=0 (la única property no llegó a 100% OK).
      expect(result.status).toBe('failed')
      expect(result.roomTypesCreated).toBe(1) // 1 OK, 1 falló
      expect(result.errors.some((e) => e.step === 'create_room_type')).toBe(true)
      // PropertySettings actualizado a 'partial' por el helper interno
      expect(prisma.propertySettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channexProvisioningStatus: 'partial' }),
        }),
      )
    })

    it('multi-property: 1 OK + 1 falla → status=partial a nivel resultado global', async () => {
      const prisma = makePrismaMock()
      // El primer findUnique devuelve la propiedad OK; el segundo no existe
      prisma.property.findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'prop-1',
          name: 'P1',
          organizationId: 'org-1',
          organization: { countryCode: 'MX', currency: 'MXN', timezone: 'UTC' },
          legalEntity: { baseCurrency: 'MXN', countryCode: 'MX' },
          settings: { channexPropertyId: null, timezone: 'UTC' },
          rooms: [{ id: 'r1', number: '101', channexRoomTypeId: null }],
        })
        .mockResolvedValueOnce(null) // prop-2 no existe
      const gateway = makeGatewayMock()
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1', 'prop-2'],
        channels: [],
        actor: baseActor,
      })
      expect(result.status).toBe('partial')
      expect(result.propertiesProvisioned).toBe(1)
      expect(result.errors.some((e) => e.step === 'lookup_property')).toBe(true)
    })

    it('Org no encontrada → status=failed, abort early', async () => {
      const prisma = makePrismaMock({ org: null })
      const gateway = makeGatewayMock()
      const svc = new ChannexProvisionService(prisma, gateway, makeCryptoMock())
      const result = await svc.provisionFromWizard({
        organizationId: 'no-existe',
        propertyIds: ['prop-1'],
        channels: [],
        actor: baseActor,
      })
      expect(result.status).toBe('failed')
      expect(result.errors[0].step).toBe('lookup_org')
      expect(gateway.createGroup).not.toHaveBeenCalled()
    })
  })

  describe('channel credentials encryption', () => {
    it('Airbnb siempre status=requires_oauth aunque haya credentials', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock()
      const crypto = makeCryptoMock(true)
      const svc = new ChannexProvisionService(prisma, gateway, crypto)
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [
          {
            type: 'AirbnbCom',
            title: 'Airbnb',
            credentials: { listing_id: '99' },
            configureLater: false,
          },
        ],
        actor: baseActor,
      })
      expect(result.channelsCreated).toBe(1)
      expect(result.channelsRequiringOauth).toBe(1)
      expect(prisma.channel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'requires_oauth' }),
        }),
      )
    })

    it('configureLater=true → status=pending_credentials, no encrypt', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock()
      const crypto = makeCryptoMock(true)
      const svc = new ChannexProvisionService(prisma, gateway, crypto)
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [
          { type: 'ExpediaCom', title: 'Expedia', configureLater: true },
        ],
        actor: baseActor,
      })
      expect(result.channelsPendingCredentials).toBe(1)
      expect(crypto.encrypt).not.toHaveBeenCalled()
    })

    it('KEK no configurada + credentials provistas → channel queda pending_credentials + error capturado', async () => {
      const prisma = makePrismaMock()
      const gateway = makeGatewayMock()
      const crypto = makeCryptoMock(false) // not ready
      const svc = new ChannexProvisionService(prisma, gateway, crypto)
      const result = await svc.provisionFromWizard({
        organizationId: 'org-1',
        propertyIds: ['prop-1'],
        channels: [
          {
            type: 'BookingCom',
            title: 'Booking',
            credentials: { hotel_id: '123', username: 'u', password: 'p' },
            configureLater: false,
          },
        ],
        actor: baseActor,
      })
      expect(crypto.encrypt).not.toHaveBeenCalled()
      expect(result.errors.some((e) => /KEK no configurada/.test(e.message))).toBe(true)
    })
  })
})
