import { PrecheckinEmailService } from './precheckin-email.service'

describe('PrecheckinEmailService (fail-soft)', () => {
  const base = {
    to: 'guest@example.com',
    guestName: 'Juan Perez',
    propertyName: 'Hotel QA',
    link: 'https://app.zenix.com/precheckin/abc',
    checkInIso: '2026-06-20T15:00:00Z',
  }
  let svc: PrecheckinEmailService
  const original = process.env.RESEND_API_KEY

  beforeEach(() => {
    svc = new PrecheckinEmailService()
  })
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = original
  })

  it('sin RESEND_API_KEY → {sent:false, reason:no-key} sin lanzar', async () => {
    delete process.env.RESEND_API_KEY
    const res = await svc.send(base)
    expect(res).toEqual({ sent: false, reason: 'no-key' })
  })

  it('no lanza ante error de red (fail-soft)', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    const spy = jest.spyOn(global, 'fetch' as any).mockRejectedValueOnce(new Error('network down'))
    const res = await svc.send({ ...base, isReminder: true })
    expect(res).toEqual({ sent: false, reason: 'network' })
    spy.mockRestore()
  })
})
