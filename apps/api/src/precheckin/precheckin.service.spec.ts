import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrecheckinService } from './precheckin.service'

// Token raw de prueba (64 hex chars = 32 bytes) + su hash.
const RAW = 'a'.repeat(64)
const HASH = crypto.createHash('sha256').update(RAW).digest('hex')

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stay-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    guestName: 'Juan Perez',
    guestFirstName: 'Juan',
    guestLastName: 'Perez',
    guestEmail: 'juan@ota.com',
    guestPhone: '+52 111',
    nationality: 'MX',
    guestSex: null,
    documentType: null,
    documentPhotoUrl: null,
    checkinAt: new Date('2026-06-20T15:00:00Z'),
    scheduledCheckout: new Date('2026-06-23T11:00:00Z'),
    actualCheckout: null,
    cancelledAt: null,
    noShowAt: null,
    precheckinTokenExpiresAt: new Date(Date.now() + 3_600_000),
    precheckinSubmittedAt: null,
    guestVerifiedFields: [],
    room: { property: { name: 'Hotel QA' } },
    ...overrides,
  }
}

describe('PrecheckinService', () => {
  let service: PrecheckinService
  let prisma: any
  let uploads: any
  let events: any

  beforeEach(() => {
    prisma = {
      guestStay: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      guestStayLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
    }
    uploads = { processBase64: jest.fn().mockResolvedValue({ id: 'img-1', url: '/api/uploads/org-1/precheckin/img-1.jpg' }) }
    events = { emit: jest.fn() }
    service = new PrecheckinService(prisma, uploads, events)
  })

  describe('generateToken', () => {
    it('persiste solo el SHA256 (el raw nunca se guarda) + expiry', async () => {
      const { rawToken, expiresAt } = await service.generateToken('stay-1', 72)
      expect(rawToken).toHaveLength(64)
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      expect(prisma.guestStay.update).toHaveBeenCalledWith({
        where: { id: 'stay-1' },
        data: expect.objectContaining({ precheckinTokenHash: expectedHash }),
      })
      // el dato persistido es el hash, NO el raw
      const persisted = prisma.guestStay.update.mock.calls[0][0].data.precheckinTokenHash
      expect(persisted).not.toEqual(rawToken)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('getContext', () => {
    it('devuelve contexto público SIN IDs internos ni folio', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay())
      const ctx = await service.getContext(RAW)
      expect(prisma.guestStay.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { precheckinTokenHash: HASH } }),
      )
      expect(ctx.guestName).toBe('Juan Perez')
      expect(ctx.propertyName).toBe('Hotel QA')
      // anti-fuga: nada de id/organizationId/propertyId/folio en el payload
      expect(ctx).not.toHaveProperty('id')
      expect(ctx).not.toHaveProperty('organizationId')
      expect(ctx).not.toHaveProperty('propertyId')
    })

    it('token no encontrado → 404', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(null)
      await expect(service.getContext(RAW)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('token expirado → 410', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(
        makeStay({ precheckinTokenExpiresAt: new Date(Date.now() - 1000) }),
      )
      await expect(service.getContext(RAW)).rejects.toBeInstanceOf(GoneException)
    })

    it('reserva cancelada → 410', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay({ cancelledAt: new Date() }))
      await expect(service.getContext(RAW)).rejects.toBeInstanceOf(GoneException)
    })

    it('estadía ya finalizada (checkout) → 410', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay({ actualCheckout: new Date() }))
      await expect(service.getContext(RAW)).rejects.toBeInstanceOf(GoneException)
    })

    it('token corto/ausente → 400', async () => {
      await expect(service.getContext('short')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('submit', () => {
    it('single-use: re-submit tras completar → 409 (el link "expira" al cargar datos)', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay({ precheckinSubmittedAt: new Date() }))
      await expect(
        service.submit(RAW, { guestPhone: '+1', consentAccepted: true } as any),
      ).rejects.toMatchObject({ status: 409 })
      expect(prisma.guestStay.update).not.toHaveBeenCalled()
    })

    it('sin consentimiento → 400 (LFPDPPP)', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay())
      await expect(
        service.submit(RAW, { consentAccepted: false } as any),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('happy path: corrige datos + sube foto + marca verifiedFields + audit + evento', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay())
      const res = await service.submit(RAW, {
        guestPhone: '+52 999 999 9999', // el huésped cambió de número
        documentType: 'passport',
        photoBase64: 'data:image/jpeg;base64,AAAA',
        consentAccepted: true,
      } as any)

      expect(uploads.processBase64).toHaveBeenCalledWith(expect.any(String), 'precheckin', 'org-1')
      const updateData = prisma.guestStay.update.mock.calls[0][0].data
      expect(updateData.guestPhone).toBe('+52 999 999 9999')
      expect(updateData.documentType).toBe('passport')
      expect(updateData.documentPhotoUrl).toContain('/precheckin/')
      expect(updateData.precheckinSubmittedAt).toBeInstanceOf(Date)
      expect(updateData.guestVerifiedFields).toEqual(
        expect.arrayContaining(['guestPhone', 'documentType', 'documentPhoto']),
      )
      expect(prisma.guestStayLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'PRECHECKIN_SUBMITTED', actorType: 'GUEST' }),
        }),
      )
      expect(events.emit).toHaveBeenCalledWith('precheckin.submitted', expect.objectContaining({ stayId: 'stay-1', photoCaptured: true }))
      expect(res).toEqual(expect.objectContaining({ ok: true, photoCaptured: true }))
    })

    it('recompone guestName si cambian first/last', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay())
      await service.submit(RAW, {
        guestFirstName: 'Juana',
        guestLastName: 'Lopez',
        consentAccepted: true,
      } as any)
      const updateData = prisma.guestStay.update.mock.calls[0][0].data
      expect(updateData.guestName).toBe('Juana Lopez')
    })

    it('sin foto: no llama uploads, photoCaptured=false', async () => {
      prisma.guestStay.findUnique.mockResolvedValue(makeStay())
      const res = await service.submit(RAW, { nationality: 'US', consentAccepted: true } as any)
      expect(uploads.processBase64).not.toHaveBeenCalled()
      expect(res.photoCaptured).toBe(false)
    })
  })
})
