import { PrecheckinScheduler } from './precheckin.scheduler'

function makeStay(over: Record<string, unknown> = {}) {
  return {
    id: 'stay-1',
    guestName: 'Juan Perez',
    guestEmail: 'juan@ota.com',
    checkinAt: new Date(Date.now() + 2 * 86_400_000), // llega en 2 días
    room: { property: { name: 'Hotel QA' } },
    ...over,
  }
}

describe('PrecheckinScheduler', () => {
  let scheduler: PrecheckinScheduler
  let prisma: any
  let precheckin: any
  let email: any

  beforeEach(() => {
    prisma = {
      guestStay: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      guestStayLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
    }
    precheckin = { generateToken: jest.fn().mockResolvedValue({ rawToken: 'r'.repeat(64), expiresAt: new Date() }) }
    email = { send: jest.fn().mockResolvedValue({ sent: true, resendMessageId: 'm1' }) }
    scheduler = new PrecheckinScheduler(prisma, precheckin, email)
  })

  it('invites: genera token, envía invitación y marca precheckinSentAt + audit', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([makeStay()])
    await scheduler.sendInvites(new Date())

    expect(precheckin.generateToken).toHaveBeenCalledWith('stay-1', expect.any(Number))
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@ota.com', isReminder: false, propertyName: 'Hotel QA' }),
    )
    // el link lleva el token, NO el id interno
    const link = email.send.mock.calls[0][0].link as string
    expect(link).toContain('/precheckin/')
    expect(link).not.toContain('stay-1')
    const upd = prisma.guestStay.update.mock.calls[0][0]
    expect(upd.data).toHaveProperty('precheckinSentAt')
    expect(prisma.guestStayLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'PRECHECKIN_EMAIL_SENT', actorType: 'SYSTEM' }) }),
    )
  })

  it('reminders: envía recordatorio y marca precheckinReminderSentAt', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([makeStay({ checkinAt: new Date(Date.now() + 12 * 3_600_000) })])
    await scheduler.sendReminders(new Date())
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ isReminder: true }))
    const upd = prisma.guestStay.update.mock.calls[0][0]
    expect(upd.data).toHaveProperty('precheckinReminderSentAt')
    expect(prisma.guestStayLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'PRECHECKIN_REMINDER_SENT' }) }),
    )
  })

  it('fail-soft transitorio (api-error): NO marca → reintenta luego', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([makeStay()])
    email.send.mockResolvedValueOnce({ sent: false, reason: 'api-error' })
    await scheduler.sendInvites(new Date())
    expect(prisma.guestStay.update).not.toHaveBeenCalled()
    expect(prisma.guestStayLog.create).not.toHaveBeenCalled()
  })

  it('no-key (stub/dev): marca el intento para no reintentar en loop', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([makeStay()])
    email.send.mockResolvedValueOnce({ sent: false, reason: 'no-key' })
    await scheduler.sendInvites(new Date())
    expect(prisma.guestStay.update).toHaveBeenCalled()
  })

  it('sin stays elegibles: no envía nada', async () => {
    await scheduler.sendInvites(new Date())
    await scheduler.sendReminders(new Date())
    expect(email.send).not.toHaveBeenCalled()
  })
})
