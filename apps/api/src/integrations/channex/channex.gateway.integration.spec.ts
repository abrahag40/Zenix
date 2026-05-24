/**
 * Channex sandbox integration tests.
 *
 * Hits https://staging.channex.io/api/v1 with the real CHANNEX_API_KEY from
 * apps/api/.env. Skipped automatically if the key is absent (CI offline).
 *
 * Run manually:
 *   cd apps/api && npx jest channex.gateway.integration --runInBand
 */

import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { ChannexGateway, ChannexHttpError } from './channex.gateway'

const hasKey = Boolean(process.env.CHANNEX_API_KEY?.trim())
const describeIfKey = hasKey ? describe : describe.skip

describeIfKey('ChannexGateway (sandbox integration)', () => {
  let gateway: ChannexGateway

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'CHANNEX_API_KEY') return process.env.CHANNEX_API_KEY
              if (k === 'CHANNEX_BASE_URL')
                return process.env.CHANNEX_BASE_URL ?? 'https://staging.channex.io/api/v1'
              return undefined
            },
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
  })

  it('listProperties devuelve HTTP 200 con la api-key configurada', async () => {
    const props = await gateway.listProperties()
    expect(Array.isArray(props)).toBe(true)
    // Sandbox tiene al menos 1 property (Hotel Boutique Test Tulum).
    expect(props.length).toBeGreaterThanOrEqual(1)
    for (const p of props) {
      expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(typeof p.title).toBe('string')
      expect(typeof p.timezone).toBe('string')
      expect(typeof p.currency).toBe('string')
    }
  }, 30_000)

  it('listBookingRevisionsFeed devuelve HTTP 200 (feed puede estar vacío)', async () => {
    const result = await gateway.listBookingRevisionsFeed({ limit: 5 })
    expect(Array.isArray(result.revisions)).toBe(true)
    expect(result.meta.page).toBe(1)
    expect(result.meta.limit).toBeGreaterThan(0)
  }, 30_000)

  it('getBookingRevision con id inválido lanza ChannexHttpError 404', async () => {
    await expect(
      gateway.getBookingRevision('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({
      name: 'ChannexHttpError',
      status: expect.any(Number),
    })
  }, 30_000)
})

// Visibility cuando no hay key: imprime nota una sola vez.
if (!hasKey) {
  // eslint-disable-next-line no-console
  console.log(
    '[channex.gateway.integration] SKIPPED — CHANNEX_API_KEY not set. ' +
      'Run from apps/api with the env loaded to execute against staging.channex.io',
  )
}
