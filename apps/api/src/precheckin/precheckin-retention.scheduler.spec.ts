import { PrecheckinRetentionScheduler } from './precheckin-retention.scheduler'

describe('PrecheckinRetentionScheduler', () => {
  let scheduler: PrecheckinRetentionScheduler
  let prisma: any
  let uploads: any

  beforeEach(() => {
    prisma = {
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      guestStayLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
    }
    uploads = { deleteByUrl: jest.fn().mockResolvedValue(true) }
    scheduler = new PrecheckinRetentionScheduler(prisma, uploads)
  })

  it('purga la foto + anula documentPhotoUrl + audita; conserva el rastro', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([
      { id: 'stay-1', documentPhotoUrl: '/api/uploads/org-1/precheckin/abc.jpg' },
    ])
    await scheduler.run()

    expect(uploads.deleteByUrl).toHaveBeenCalledWith('/api/uploads/org-1/precheckin/abc.jpg')
    const upd = prisma.guestStay.update.mock.calls[0][0]
    expect(upd.data).toEqual({ documentPhotoUrl: null })
    expect(prisma.guestStayLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'PRECHECKIN_PHOTO_PURGED', actorType: 'SYSTEM' }) }),
    )
  })

  it('solo busca fotos scope precheckin + checkout antiguo', async () => {
    await scheduler.run()
    const where = prisma.guestStay.findMany.mock.calls[0][0].where
    expect(where.documentPhotoUrl).toEqual({ contains: '/precheckin/' })
    expect(where.actualCheckout.lt).toBeInstanceOf(Date)
  })

  it('sin fotos elegibles: no borra nada', async () => {
    await scheduler.run()
    expect(uploads.deleteByUrl).not.toHaveBeenCalled()
    expect(prisma.guestStay.update).not.toHaveBeenCalled()
  })

  it('purgeExpiredTokens: anula el token de stays con check-in pasado (memoria)', async () => {
    await scheduler.purgeExpiredTokens()
    const call = prisma.guestStay.updateMany.mock.calls[0][0]
    expect(call.where.precheckinTokenHash).toEqual({ not: null })
    expect(call.where.checkinAt.lt).toBeInstanceOf(Date)
    // solo anula el token; conserva el rastro (submittedAt/verifiedFields)
    expect(call.data).toEqual({ precheckinTokenHash: null, precheckinTokenExpiresAt: null })
  })

  it('un fallo de borrado no aborta el batch', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([
      { id: 's1', documentPhotoUrl: '/api/uploads/o/precheckin/a.jpg' },
      { id: 's2', documentPhotoUrl: '/api/uploads/o/precheckin/b.jpg' },
    ])
    prisma.guestStay.update.mockRejectedValueOnce(new Error('db blip'))
    await scheduler.run()
    // s2 igual se procesa pese al fallo de s1
    expect(prisma.guestStay.update).toHaveBeenCalledTimes(2)
  })
})
