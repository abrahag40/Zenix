/**
 * properties.service.remove — regression guard 2026-05-24.
 *
 * Bug pre-Day 9: PropertiesService.remove llamaba prisma.property.delete()
 * directo (hard delete). Cascade-borraba Rooms, GuestStays, PaymentLogs,
 * AuditLogs — evidence chargeback Visa CRR §5.9.2 + USALI append-only
 * fiscal-grade violados.
 *
 * Fix: remove() ahora hace soft-delete (deletedAt=now()).
 *
 * Este spec garantiza que remove NUNCA vuelva a ser hard delete.
 */
import { PropertiesService } from './properties.service'

describe('PropertiesService.remove — soft-delete regression guard', () => {
  function build() {
    const prisma: any = {
      property: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Tulum' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Tulum' }),
        update: jest.fn().mockResolvedValue({ id: 'p-1', deletedAt: new Date() }),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const tenant: any = { getOrganizationId: jest.fn().mockReturnValue('org-1') }
    return { service: new PropertiesService(prisma, tenant), prisma }
  }

  it('remove() usa prisma.property.update con deletedAt, NUNCA delete', async () => {
    const { service, prisma } = build()
    await service.remove('p-1')

    // El sello del soft-delete: update llamado con deletedAt timestamp.
    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    })

    // CRÍTICO: prisma.property.delete NUNCA debe invocarse — cascade-borraría
    // PaymentLogs, AuditLogs, CFDIs (evidence chargeback Visa + USALI).
    expect(prisma.property.delete).not.toHaveBeenCalled()
  })

  it('findAll filtra deletedAt:null (no expone Properties archivadas)', async () => {
    const { service, prisma } = build()
    await service.findAll()
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    )
  })

  it('findOne filtra deletedAt:null (no expone Properties archivadas)', async () => {
    const { service, prisma } = build()
    await service.findOne('p-1')
    expect(prisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    )
  })
})
