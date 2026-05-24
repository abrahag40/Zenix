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

describe('PropertiesService.remove — soft-delete + type-to-confirm regression guard', () => {
  const PROPERTY = { id: 'p-1', name: 'Hotel Boutique Tulum' }

  function build() {
    const prisma: any = {
      property: {
        findFirst: jest.fn().mockResolvedValue(PROPERTY),
        findUnique: jest.fn().mockResolvedValue(PROPERTY),
        update: jest.fn().mockResolvedValue({ ...PROPERTY, deletedAt: new Date() }),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const tenant: any = { getOrganizationId: jest.fn().mockReturnValue('org-1') }
    return { service: new PropertiesService(prisma, tenant), prisma }
  }

  it('remove() con confirmation exacto → soft-delete (update con deletedAt)', async () => {
    const { service, prisma } = build()
    await service.remove('p-1', 'Hotel Boutique Tulum')

    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    })
    expect(prisma.property.delete).not.toHaveBeenCalled()
  })

  it('remove() SIN confirmation → BadRequestException', async () => {
    const { service, prisma } = build()
    await expect(service.remove('p-1')).rejects.toThrow(/requiere "confirmation"/)
    expect(prisma.property.update).not.toHaveBeenCalled()
    expect(prisma.property.delete).not.toHaveBeenCalled()
  })

  it('remove() con confirmation mal escrita → BadRequestException', async () => {
    const { service, prisma } = build()
    await expect(service.remove('p-1', 'hotel tulum')).rejects.toThrow(/no coincide/)
    expect(prisma.property.update).not.toHaveBeenCalled()
  })

  it('remove() es CASE-SENSITIVE (forzar atención del operador)', async () => {
    const { service } = build()
    await expect(service.remove('p-1', 'HOTEL BOUTIQUE TULUM')).rejects.toThrow(/no coincide/)
  })

  it('remove() con confirmation con espacios trailing → BadRequest (exacto)', async () => {
    const { service } = build()
    await expect(service.remove('p-1', 'Hotel Boutique Tulum ')).rejects.toThrow(/no coincide/)
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
