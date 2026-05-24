/**
 * rooms.service.remove — regression guard 2026-05-24.
 *
 * Bug pre-Day 9: hard delete. Cascade a GuestStays, StaySegments, RoomBlocks,
 * TaskLogs, CleaningTasks. Fix: soft-delete via deletedAt.
 */
import { RoomsService } from './rooms.service'

describe('RoomsService.remove — soft-delete regression guard', () => {
  function build() {
    const prisma: any = {
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r-1', number: '101' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'r-1', number: '101' }),
        update: jest.fn().mockResolvedValue({ id: 'r-1', deletedAt: new Date() }),
        delete: jest.fn(),
      },
    }
    const tenant: any = { getOrganizationId: jest.fn().mockReturnValue('org-1') }
    return { service: new RoomsService(prisma, tenant), prisma }
  }

  it('remove() usa update con deletedAt, NUNCA delete', async () => {
    const { service, prisma } = build()
    await service.remove('r-1')
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    })
    expect(prisma.room.delete).not.toHaveBeenCalled()
  })
})
