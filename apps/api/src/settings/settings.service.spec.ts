/**
 * settings.service.spec.ts
 *
 * Tests del SettingsService — focus en `getLegalEntityStatus`
 * (Sprint PAC-CLIENT-WARNING 2026-05-29).
 *
 * Cubre:
 *  · Property no existe → NotFoundException
 *  · Property sin legalEntityId → retorna NOT_REQUIRED gracioso (no throw)
 *  · LegalEntity FK rota → NotFoundException
 *  · LegalEntity PAC CONFIGURED → shape correcto
 *  · LegalEntity PAC PENDING (skip wizard) → reason expuesta
 *  · LegalEntity PAC FAILED → reason expuesta
 */
import { NotFoundException } from '@nestjs/common'
import { SettingsService } from './settings.service'

function makePrismaMock(opts: {
  property?: any
  legalEntity?: any
} = {}) {
  return {
    property: {
      findUnique: jest.fn().mockResolvedValue(
        opts.property === null ? null : opts.property ?? { id: 'prop-1', legalEntityId: 'le-1' },
      ),
    },
    legalEntity: {
      findUnique: jest.fn().mockResolvedValue(
        opts.legalEntity === null
          ? null
          : opts.legalEntity ?? {
              id: 'le-1',
              name: 'Hotel Boutique Tulum S.A. de C.V.',
              countryCode: 'MX',
              pacStatus: 'CONFIGURED',
              pacStatusUpdatedAt: new Date('2026-05-29T10:00:00Z'),
              pacStatusReason: null,
            },
      ),
    },
    propertySettings: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  } as any
}

describe('SettingsService — getLegalEntityStatus (PAC-CLIENT-WARNING)', () => {
  it('Property no existe → NotFoundException', async () => {
    const prisma = makePrismaMock({ property: null })
    const service = new SettingsService(prisma)
    await expect(service.getLegalEntityStatus('prop-missing')).rejects.toThrow(NotFoundException)
  })

  it('Property sin legalEntityId → retorna NOT_REQUIRED gracioso (no throw)', async () => {
    const prisma = makePrismaMock({
      property: { id: 'prop-1', legalEntityId: null },
    })
    const service = new SettingsService(prisma)
    const res = await service.getLegalEntityStatus('prop-1')
    expect(res).toEqual({
      legalEntityId: null,
      pacStatus: 'NOT_REQUIRED',
      pacStatusUpdatedAt: null,
      pacStatusReason: null,
      countryCode: null,
      legalEntityName: null,
    })
    expect(prisma.legalEntity.findUnique).not.toHaveBeenCalled()
  })

  it('LegalEntity FK rota → NotFoundException', async () => {
    const prisma = makePrismaMock({
      property: { id: 'prop-1', legalEntityId: 'le-orphan' },
      legalEntity: null,
    })
    const service = new SettingsService(prisma)
    await expect(service.getLegalEntityStatus('prop-1')).rejects.toThrow(NotFoundException)
  })

  it('LegalEntity PAC CONFIGURED → shape correcto sin reason', async () => {
    const prisma = makePrismaMock()
    const service = new SettingsService(prisma)
    const res = await service.getLegalEntityStatus('prop-1')
    expect(res).toMatchObject({
      legalEntityId: 'le-1',
      pacStatus: 'CONFIGURED',
      pacStatusReason: null,
      countryCode: 'MX',
      legalEntityName: 'Hotel Boutique Tulum S.A. de C.V.',
    })
  })

  it('LegalEntity PAC PENDING (skip wizard) → reason expuesta', async () => {
    const prisma = makePrismaMock({
      legalEntity: {
        id: 'le-1',
        name: 'Hotel Skip',
        countryCode: 'MX',
        pacStatus: 'PENDING',
        pacStatusUpdatedAt: new Date('2026-05-29T10:00:00Z'),
        pacStatusReason: 'Activado por consultor sin verificar PAC en wizard',
      },
    })
    const service = new SettingsService(prisma)
    const res = await service.getLegalEntityStatus('prop-1')
    expect(res.pacStatus).toBe('PENDING')
    expect(res.pacStatusReason).toContain('sin verificar PAC')
  })

  it('LegalEntity PAC FAILED → cliente sabe que hubo error', async () => {
    const prisma = makePrismaMock({
      legalEntity: {
        id: 'le-1',
        name: 'Hotel Tax',
        countryCode: 'MX',
        pacStatus: 'FAILED',
        pacStatusUpdatedAt: new Date(),
        pacStatusReason: 'Health-check rechazó credenciales — verificar usuario/password Facturama',
      },
    })
    const service = new SettingsService(prisma)
    const res = await service.getLegalEntityStatus('prop-1')
    expect(res.pacStatus).toBe('FAILED')
    expect(res.pacStatusReason).toContain('credenciales')
  })
})
