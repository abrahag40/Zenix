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
import { ChannexGateway, ChannexHttpError } from './channex.gateway'

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
