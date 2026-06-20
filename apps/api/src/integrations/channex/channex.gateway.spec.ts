/**
 * ChannexGateway unit tests — fetch mocked to verify HTTP status handling
 * without hitting the live sandbox.
 *
 * Focus: audit findings from 2026-05-22.
 *   · C2 — ack 404/422 idempotent (was DEAD_LETTER false alarm before fix)
 *   · ChannexHttpError shape preserved for retry logic in the puller
 */

import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import {
  ChannexGateway,
  ChannexHttpError,
  ChannexRateLimitError,
  parseRetryAfter,
} from './channex.gateway'

function mockFetchOnce(status: number, body: string | object = '') {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  ;(global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === 'string' ? {} : body),
  })
}

describe('ChannexGateway — ackBookingRevision (audit C2)', () => {
  let gateway: ChannexGateway

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'CHANNEX_API_KEY') return 'test-key'
              if (k === 'CHANNEX_BASE_URL') return 'https://staging.channex.io/api/v1'
              return undefined
            },
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
  })

  it('200 → acked:true alreadyAcked:false', async () => {
    mockFetchOnce(200, { meta: { message: 'Success' } })
    const result = await gateway.ackBookingRevision('rev-1')
    expect(result).toEqual({ acked: true, alreadyAcked: false })
  })

  it('audit C2: 404 → acked:true alreadyAcked:true (idempotent, NO throw)', async () => {
    mockFetchOnce(404, { error: 'not found' })
    const result = await gateway.ackBookingRevision('rev-1')
    expect(result).toEqual({ acked: true, alreadyAcked: true })
  })

  it('422 → acked:true alreadyAcked:true (idempotent defensive)', async () => {
    mockFetchOnce(422, { error: 'already acked' })
    const result = await gateway.ackBookingRevision('rev-1')
    expect(result).toEqual({ acked: true, alreadyAcked: true })
  })

  it('401 → throws ChannexHttpError (api-key broken — terminal)', async () => {
    mockFetchOnce(401, 'Unauthorized')
    await expect(gateway.ackBookingRevision('rev-1')).rejects.toMatchObject({
      name: 'ChannexHttpError',
      status: 401,
    })
  })

  it('500 → throws ChannexHttpError (transient — puller retries)', async () => {
    mockFetchOnce(500, 'boom')
    await expect(gateway.ackBookingRevision('rev-1')).rejects.toMatchObject({
      name: 'ChannexHttpError',
      status: 500,
    })
  })
})

// ── OUTBOUND-CERT Day 1 — Gateway extensions ───────────────────────────────

describe('ChannexGateway.pushAvailability (Sprint OUTBOUND-CERT)', () => {
  let gateway: ChannexGateway
  let fetchMock: jest.Mock

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'CHANNEX_API_KEY'
                ? 'test-key'
                : 'https://staging.channex.io/api/v1',
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      json: () => Promise.resolve({}),
    })
    ;(global as { fetch: unknown }).fetch = fetchMock
  })

  it('POST /availability con date single → values shape correcto', async () => {
    await gateway.pushAvailability([
      { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 },
    ])

    const url = fetchMock.mock.calls[0][0]
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(url).toContain('/availability')
    expect(body).toEqual({
      values: [
        { property_id: 'p1', room_type_id: 'rt1', date: '2026-06-01', availability: 3 },
      ],
    })
  })

  it('POST /availability con date_from+date_to → values shape correcto', async () => {
    await gateway.pushAvailability([
      {
        propertyId: 'p1',
        roomTypeId: 'rt1',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-10',
        availability: 2,
      },
    ])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0]).toEqual({
      property_id: 'p1',
      room_type_id: 'rt1',
      date_from: '2026-06-01',
      date_to: '2026-06-10',
      availability: 2,
    })
  })

  it('batch multi-property en 1 HTTP call (AP-4 mitigado)', async () => {
    await gateway.pushAvailability([
      { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 },
      { propertyId: 'p2', roomTypeId: 'rt2', date: '2026-06-02', availability: 1 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values).toHaveLength(2)
  })

  it('entries vacío → no-op (no HTTP call)', async () => {
    await gateway.pushAvailability([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Channex 500 → throws ChannexHttpError (worker retries)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    })
    await expect(
      gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 1 },
      ]),
    ).rejects.toMatchObject({ name: 'ChannexHttpError', status: 500 })
  })
})

describe('ChannexGateway.pushRestrictions (Sprint OUTBOUND-CERT)', () => {
  let gateway: ChannexGateway
  let fetchMock: jest.Mock

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'CHANNEX_API_KEY'
                ? 'test-key'
                : 'https://staging.channex.io/api/v1',
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
      json: () => Promise.resolve({}),
    })
    ;(global as { fetch: unknown }).fetch = fetchMock
  })

  it('cert Test 2: single rate single date → 1 HTTP call con 1 entry', async () => {
    await gateway.pushRestrictions([
      {
        propertyId: 'p1',
        ratePlanId: 'rp-bar',
        date: '2026-11-22',
        rate: 333,
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0]).toEqual({
      property_id: 'p1',
      rate_plan_id: 'rp-bar',
      date: '2026-11-22',
      // rate va como STRING — Channex descarta decimales enviados como número (fix 2026-06-19)
      rate: '333',
    })
  })

  it('cert Test 3: 3 rates en 1 HTTP call (AP-4 mitigado — anti per-rate loop)', async () => {
    await gateway.pushRestrictions([
      { propertyId: 'p1', ratePlanId: 'rp-twin-bar', date: '2026-12-01', rate: 100 },
      { propertyId: 'p1', ratePlanId: 'rp-twin-bb', date: '2026-12-01', rate: 120 },
      { propertyId: 'p1', ratePlanId: 'rp-dbl-bar', date: '2026-12-02', rate: 100 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).values).toHaveLength(3)
  })

  it('cert Test 5: min_stay batch — 3 entries en 1 call', async () => {
    await gateway.pushRestrictions([
      { propertyId: 'p1', ratePlanId: 'rp1', date: '2026-12-24', minStayThrough: 3 },
      { propertyId: 'p1', ratePlanId: 'rp2', date: '2026-12-31', minStayThrough: 4 },
      { propertyId: 'p1', ratePlanId: 'rp3', date: '2027-02-14', minStayThrough: 2 },
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0].min_stay_through).toBe(3)
    expect(body.values).toHaveLength(3)
  })

  it('cert Test 7: multi-restriction (CTA + CTD + min + max) en 1 entry', async () => {
    await gateway.pushRestrictions([
      {
        propertyId: 'p1',
        ratePlanId: 'rp1',
        dateFrom: '2026-12-20',
        dateTo: '2027-01-05',
        rate: 250,
        minStayThrough: 3,
        maxStay: 14,
        closedToArrival: true,
        closedToDeparture: true,
        stopSell: false,
      },
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0]).toMatchObject({
      property_id: 'p1',
      rate_plan_id: 'rp1',
      date_from: '2026-12-20',
      date_to: '2027-01-05',
      rate: '250',
      min_stay_through: 3,
      max_stay: 14,
      closed_to_arrival: true,
      closed_to_departure: true,
      stop_sell: false,
    })
  })

  it('per-occupancy rates: usa `rates` array en vez de `rate` singular', async () => {
    await gateway.pushRestrictions([
      {
        propertyId: 'p1',
        ratePlanId: 'rp1',
        date: '2026-12-01',
        rates: [
          { occupancy: 1, rate: 121 },
          { occupancy: 2, rate: 132 },
        ],
      },
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0].rates).toEqual([
      { occupancy: 1, rate: 121 },
      { occupancy: 2, rate: 132 },
    ])
  })

  it('rejects entry without any restriction field (Channex: "at least one required")', async () => {
    await expect(
      gateway.pushRestrictions([
        {
          propertyId: 'p1',
          ratePlanId: 'rp1',
          date: '2026-12-01',
          // NO rate, NO restriction field → throw
        },
      ]),
    ).rejects.toThrow(/at least one restriction/)
  })

  it('days filter: solo aplica a weekdays especificados', async () => {
    await gateway.pushRestrictions([
      {
        propertyId: 'p1',
        ratePlanId: 'rp1',
        dateFrom: '2026-12-01',
        dateTo: '2026-12-31',
        days: ['fr', 'sa'],
        rate: 300,
      },
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.values[0].days).toEqual(['fr', 'sa'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Sprint CHANNEX-CERT-B1 (2026-05-29) — Retry-After header parsing
// ═══════════════════════════════════════════════════════════════════════════
//
// Cert Stage 4 anti-pattern AP-2.3: ignorar `Retry-After` que Channex provee
// gatilla rechazo automático. El gateway debe parsearlo y lanzar
// ChannexRateLimitError con el valor exacto.
//
// Casos cubiertos:
//   1. parseRetryAfter pure function: delta-seconds / HTTP-date / null / malformed
//   2. Gateway 429 con header → throws ChannexRateLimitError con valor parseado
//   3. Gateway 429 sin header → throws con retryAfterSeconds=null
//   4. Gateway 4xx no-429 → throws ChannexHttpError plano (no rate limit)
//   5. Gateway 5xx → throws ChannexHttpError plano

describe('parseRetryAfter (RFC 7231 §7.1.3)', () => {
  it('delta-seconds numérico → integer', () => {
    expect(parseRetryAfter('120')).toBe(120)
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter('  300  ')).toBe(300)
  })

  it('delta-seconds decimal → ceil hacia arriba', () => {
    expect(parseRetryAfter('30.4')).toBe(31)
    expect(parseRetryAfter('59.999')).toBe(60)
  })

  it('HTTP-date futuro → seconds calculados', () => {
    const future = new Date(Date.now() + 90_000)
    const httpDate = future.toUTCString()
    const result = parseRetryAfter(httpDate)
    expect(result).toBeGreaterThanOrEqual(88)
    expect(result).toBeLessThanOrEqual(92)
  })

  it('HTTP-date pasado → null (server bug, no overshoot a negativo)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    expect(parseRetryAfter(past)).toBe(null)
  })

  it('null / undefined / vacío → null', () => {
    expect(parseRetryAfter(null)).toBe(null)
    expect(parseRetryAfter(undefined)).toBe(null)
    expect(parseRetryAfter('')).toBe(null)
    expect(parseRetryAfter('   ')).toBe(null)
  })

  it('malformed → null (no throw)', () => {
    expect(parseRetryAfter('not-a-number')).toBe(null)
    expect(parseRetryAfter('foo bar')).toBe(null)
    expect(parseRetryAfter('-100')).toBe(null) // negative seconds inválido (parseFloat OK pero -100 < 0)
  })
})

describe('ChannexGateway — throwIfNotOk (Sprint CHANNEX-CERT-B1)', () => {
  let gateway: ChannexGateway

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'CHANNEX_API_KEY') return 'test-key'
              if (k === 'CHANNEX_BASE_URL') return 'https://staging.channex.io/api/v1'
              return undefined
            },
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
  })

  function mockFetchWithHeaders(status: number, headers: Record<string, string> = {}, body: string = '') {
    ;(global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({}),
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
      },
    })
  }

  it('429 con Retry-After=180 → ChannexRateLimitError con retryAfterSeconds=180', async () => {
    mockFetchWithHeaders(429, { 'retry-after': '180' }, 'rate limited')
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexRateLimitError)
      expect((err as ChannexRateLimitError).status).toBe(429)
      expect((err as ChannexRateLimitError).retryAfterSeconds).toBe(180)
    }
  })

  it('429 con Retry-After HTTP-date → ChannexRateLimitError con seconds calculados', async () => {
    const future = new Date(Date.now() + 120_000).toUTCString()
    mockFetchWithHeaders(429, { 'retry-after': future })
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexRateLimitError)
      const seconds = (err as ChannexRateLimitError).retryAfterSeconds
      expect(seconds).toBeGreaterThanOrEqual(115)
      expect(seconds).toBeLessThanOrEqual(125)
    }
  })

  it('429 sin Retry-After header → ChannexRateLimitError con retryAfterSeconds=null', async () => {
    mockFetchWithHeaders(429, {}, 'over limit')
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexRateLimitError)
      expect((err as ChannexRateLimitError).retryAfterSeconds).toBe(null)
    }
  })

  it('429 con Retry-After malformed → ChannexRateLimitError con null (fail-soft)', async () => {
    mockFetchWithHeaders(429, { 'retry-after': 'not-a-number' })
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexRateLimitError)
      expect((err as ChannexRateLimitError).retryAfterSeconds).toBe(null)
    }
  })

  it('400 (bad payload) → ChannexHttpError plano, NO ChannexRateLimitError', async () => {
    mockFetchWithHeaders(400, {}, '{"errors":"bad"}')
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexHttpError)
      expect(err).not.toBeInstanceOf(ChannexRateLimitError)
      expect((err as ChannexHttpError).status).toBe(400)
    }
  })

  it('500 → ChannexHttpError plano (worker hace exp backoff propio)', async () => {
    mockFetchWithHeaders(500, {}, 'server error')
    try {
      await gateway.pushAvailability([
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 5 },
      ])
      fail('Expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ChannexHttpError)
      expect(err).not.toBeInstanceOf(ChannexRateLimitError)
      expect((err as ChannexHttpError).status).toBe(500)
    }
  })
})
