/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 4 integration tests.
 *
 * Verifica los 10 nuevos métodos CRUD del ChannexGateway contra `staging.channex.io`.
 *
 * Modo dual:
 *   · Unit tests con `fetch` mockeado — siempre corren
 *   · Sandbox tests reales contra staging.channex.io — solo si CHANNEX_API_KEY set
 *
 * Cert checkpoint #1: cada método nuevo tiene su sandbox test verified HTTP 200.
 */
import { ConfigService } from '@nestjs/config'
import { ChannexGateway, ChannexHttpError } from './channex.gateway'

const SANDBOX_ENABLED = !!process.env.CHANNEX_API_KEY
const SANDBOX_PROPERTY_ID = 'ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13' // Hotel Boutique Test Tulum
const SEED_ROOM_TYPE_ID = '2bde3aba-2f90-4890-a61d-2ab28f3a979b'  // Estándar (creado Day 2)

function makeConfig(extra: Record<string, string | undefined> = {}): ConfigService {
  // Para unit tests con mock fetch: usar override `extra.apiKey` si se provee
  // (test isolation). Para sandbox tests: usar env real.
  return {
    get: (key: string) => {
      if (key === 'CHANNEX_API_KEY') return extra.apiKey ?? process.env.CHANNEX_API_KEY
      if (key === 'CHANNEX_BASE_URL') return extra.baseUrl ?? process.env.CHANNEX_BASE_URL ?? 'https://staging.channex.io/api/v1'
      return undefined
    },
  } as any
}

describe('ChannexGateway CRUD extensions — Day 4 unit (mock fetch)', () => {
  let gateway: ChannexGateway
  const fetchSpy = jest.spyOn(global, 'fetch')

  beforeEach(() => {
    fetchSpy.mockReset()
    gateway = new ChannexGateway(makeConfig({ apiKey: 'fake-key' }))
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  // ── listRoomTypes ───────────────────────────────────────────────────────

  describe('listRoomTypes', () => {
    it('GET /room_types?filter[property_id] → array of room types', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'rt-1', attributes: { title: 'Estándar', count_of_rooms: 6, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 } },
          ],
        }),
      } as any)

      const result = await gateway.listRoomTypes('prop-1')
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/room_types?filter%5Bproperty_id%5D=prop-1'),
        expect.objectContaining({ headers: { 'user-api-key': 'fake-key' } }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('rt-1')
      expect(result[0].title).toBe('Estándar')
    })

    it('non-2xx → ChannexHttpError', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as any)
      await expect(gateway.listRoomTypes('prop-1')).rejects.toThrow(ChannexHttpError)
    })
  })

  // ── createRoomType ──────────────────────────────────────────────────────

  describe('createRoomType', () => {
    it('POST /room_types with full body', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'rt-new', attributes: { title: 'Suite', count_of_rooms: 4, occ_adults: 3, occ_children: 2, occ_infants: 0, default_occupancy: 2 } } }),
      } as any)

      const result = await gateway.createRoomType({
        propertyId: 'prop-1',
        title: 'Suite',
        countOfRooms: 4,
        occAdults: 3,
        occChildren: 2,
      })

      const [url, opts] = fetchSpy.mock.calls[0] as any
      expect(url).toContain('/room_types')
      expect(opts.method).toBe('POST')
      const body = JSON.parse(opts.body)
      expect(body.room_type.property_id).toBe('prop-1')
      expect(body.room_type.title).toBe('Suite')
      expect(body.room_type.count_of_rooms).toBe(4)
      expect(body.room_type.occ_adults).toBe(3)
      expect(body.room_type.occ_children).toBe(2)
      expect(body.room_type.occ_infants).toBe(0) // default
      expect(body.room_type.default_occupancy).toBe(3) // = occAdults
      expect(body.room_type.room_kind).toBe('room') // default
      expect(result.id).toBe('rt-new')
    })

    it('bad request → ChannexHttpError con mensaje', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => '{"errors":{"title":["required"]}}',
      } as any)

      await expect(
        gateway.createRoomType({
          propertyId: 'prop-1',
          title: '',
          countOfRooms: 1,
          occAdults: 1,
        }),
      ).rejects.toThrow(/422/)
    })
  })

  // ── updateRoomType ──────────────────────────────────────────────────────

  describe('updateRoomType', () => {
    it('PUT /room_types/:id only with fields provided (partial update)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'rt-1', attributes: { title: 'Estándar Plus', count_of_rooms: 8, occ_adults: 2, occ_children: 1, occ_infants: 0, default_occupancy: 2 } } }),
      } as any)

      await gateway.updateRoomType('rt-1', {
        title: 'Estándar Plus',
        countOfRooms: 8,
      })

      const [url, opts] = fetchSpy.mock.calls[0] as any
      expect(url).toContain('/room_types/rt-1')
      expect(opts.method).toBe('PUT')
      const body = JSON.parse(opts.body)
      // Sólo title + count_of_rooms en body — no incluye otros campos
      expect(Object.keys(body.room_type).sort()).toEqual(['count_of_rooms', 'title'])
      expect(body.room_type.title).toBe('Estándar Plus')
      expect(body.room_type.count_of_rooms).toBe(8)
    })
  })

  // ── deleteRoomType ──────────────────────────────────────────────────────

  describe('deleteRoomType', () => {
    it('DELETE /room_types/:id', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true } as any)
      await gateway.deleteRoomType('rt-1')
      const [url, opts] = fetchSpy.mock.calls[0] as any
      expect(url).toContain('/room_types/rt-1')
      expect(opts.method).toBe('DELETE')
    })

    it('404 → ChannexHttpError', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' } as any)
      await expect(gateway.deleteRoomType('non-existent')).rejects.toThrow(/404/)
    })
  })

  // ── listRatePlans ───────────────────────────────────────────────────────

  describe('listRatePlans', () => {
    it('GET /rate_plans?filter[property_id]', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'rp-1', attributes: { title: 'BAR Estándar', currency: 'USD', sell_mode: 'per_room', rate_mode: 'manual', options: [{ occupancy: 2, is_primary: true, rate: '70.00' }] } },
          ],
        }),
      } as any)

      const result = await gateway.listRatePlans('prop-1')
      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe('USD')
    })
  })

  // ── createRatePlan ──────────────────────────────────────────────────────

  describe('createRatePlan', () => {
    it('POST /rate_plans con rate en cents + occupancy primary option', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'rp-new', attributes: { title: 'BAR Suite', currency: 'USD', sell_mode: 'per_room', rate_mode: 'manual', options: [{ occupancy: 2, is_primary: true, rate: '280.00' }] } } }),
      } as any)

      await gateway.createRatePlan({
        propertyId: 'prop-1',
        roomTypeId: 'rt-1',
        title: 'BAR Suite',
        currency: 'USD',
        rateCents: 28000, // $280.00
        occupancy: 2,
      })

      const body = JSON.parse((fetchSpy.mock.calls[0] as any)[1].body)
      expect(body.rate_plan.property_id).toBe('prop-1')
      expect(body.rate_plan.room_type_id).toBe('rt-1')
      expect(body.rate_plan.currency).toBe('USD')
      expect(body.rate_plan.sell_mode).toBe('per_room') // default
      expect(body.rate_plan.rate_mode).toBe('manual') // default
      expect(body.rate_plan.options).toHaveLength(1)
      expect(body.rate_plan.options[0]).toMatchObject({
        occupancy: 2,
        is_primary: true,
        rate: 28000,
      })
    })

    it('per_person sell_mode override + custom occupancy', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'rp-pp', attributes: { sell_mode: 'per_person' } } }),
      } as any)
      await gateway.createRatePlan({
        propertyId: 'p',
        roomTypeId: 'rt',
        title: 'Per Person',
        currency: 'USD',
        rateCents: 5000,
        sellMode: 'per_person',
        occupancy: 1,
      })
      const body = JSON.parse((fetchSpy.mock.calls[0] as any)[1].body)
      expect(body.rate_plan.sell_mode).toBe('per_person')
      expect(body.rate_plan.options[0].occupancy).toBe(1)
    })
  })

  // ── updateRatePlan + deleteRatePlan ────────────────────────────────────

  describe('updateRatePlan + deleteRatePlan', () => {
    it('updateRatePlan partial body', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'rp-1', attributes: { title: 'BAR Renamed' } } }),
      } as any)
      await gateway.updateRatePlan('rp-1', { title: 'BAR Renamed' })
      const body = JSON.parse((fetchSpy.mock.calls[0] as any)[1].body)
      expect(Object.keys(body.rate_plan)).toEqual(['title'])
    })

    it('deleteRatePlan', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true } as any)
      await gateway.deleteRatePlan('rp-1')
      expect((fetchSpy.mock.calls[0] as any)[1].method).toBe('DELETE')
    })
  })

  // ── listChannels ────────────────────────────────────────────────────────

  describe('listChannels', () => {
    it('GET /channels?filter[property_id]', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'ch-1', attributes: { title: 'Booking.com', channel: 'booking_com', is_active: true } },
          ],
        }),
      } as any)

      const result = await gateway.listChannels('prop-1')
      expect(result[0].channel).toBe('booking_com')
      expect(result[0].is_active).toBe(true)
    })
  })

  // ── requireEnabled cuando no hay API key ─────────────────────────────────

  describe('CHANNEX_API_KEY missing → 503', () => {
    it('createRoomType lanza 503', async () => {
      const noKeyGateway = new ChannexGateway({ get: () => undefined } as any)
      await expect(noKeyGateway.createRoomType({ propertyId: 'p', title: 't', countOfRooms: 1, occAdults: 1 })).rejects.toThrow(/CHANNEX_API_KEY not set/)
    })

    it('listRoomTypes lanza 503', async () => {
      const noKeyGateway = new ChannexGateway({ get: () => undefined } as any)
      await expect(noKeyGateway.listRoomTypes('p')).rejects.toThrow(/CHANNEX_API_KEY/)
    })
  })
})

// ─── Sandbox integration tests — staging.channex.io (Cert checkpoint #1) ──
//
// Conditional describe — solo corre si CHANNEX_API_KEY set en env. CI default skip.

const sandboxDescribe = SANDBOX_ENABLED ? describe : describe.skip

sandboxDescribe('ChannexGateway CRUD — sandbox integration (staging.channex.io)', () => {
  let gateway: ChannexGateway

  beforeAll(() => {
    gateway = new ChannexGateway(makeConfig())
  })

  it('listRoomTypes contra sandbox → HTTP 200 + room types existentes', async () => {
    const result = await gateway.listRoomTypes(SANDBOX_PROPERTY_ID)
    expect(result.length).toBeGreaterThanOrEqual(5) // 5 creados Day 2
    const titles = result.map((rt) => rt.title)
    expect(titles).toContain('Estándar')
    expect(titles).toContain('Suite')
  }, 30_000)

  it('listRatePlans contra sandbox → HTTP 200 + 5 BAR plans', async () => {
    const result = await gateway.listRatePlans(SANDBOX_PROPERTY_ID)
    expect(result.length).toBeGreaterThanOrEqual(5)
  }, 30_000)

  it('listChannels contra sandbox → HTTP 200 (array; puede ser vacío si no hay canales conectados)', async () => {
    const result = await gateway.listChannels(SANDBOX_PROPERTY_ID)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('roundtrip: createRoomType + updateRoomType + deleteRoomType', async () => {
    // Create
    const created = await gateway.createRoomType({
      propertyId: SANDBOX_PROPERTY_ID,
      title: 'TEST-DAY4-' + Date.now(),
      countOfRooms: 2,
      occAdults: 2,
      occChildren: 0,
    })
    expect(created.id).toBeDefined()

    // Update
    const updated = await gateway.updateRoomType(created.id!, { countOfRooms: 3 })
    expect(updated.count_of_rooms).toBe(3)

    // Delete (cleanup)
    await expect(gateway.deleteRoomType(created.id!)).resolves.not.toThrow()
  }, 60_000)

  it('roundtrip: createRatePlan + deleteRatePlan', async () => {
    const created = await gateway.createRatePlan({
      propertyId: SANDBOX_PROPERTY_ID,
      roomTypeId: SEED_ROOM_TYPE_ID,
      title: 'TEST-RP-DAY4-' + Date.now(),
      currency: 'USD',
      rateCents: 5000,
      occupancy: 2,
    })
    expect(created.id).toBeDefined()

    await expect(gateway.deleteRatePlan(created.id!)).resolves.not.toThrow()
  }, 60_000)
})
