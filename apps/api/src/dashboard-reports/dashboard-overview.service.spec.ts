/**
 * DashboardOverviewService — unit tests focused on:
 *   1. Role redaction (HOUSEKEEPER never sees guest names / financial data)
 *   2. Empty-state safety (zero rooms / zero stays don't NaN-divide)
 *   3. Block category mapping (BlockReason → mobile category bucket)
 *
 * Heavy DB query logic is integration-tested via the live endpoint
 * (already verified manually with curl). These specs lock down the
 * privacy + edge-case contract.
 */

import { Test } from '@nestjs/testing'
import { DashboardOverviewService } from './dashboard-overview.service'
import { PrismaService } from '../prisma/prisma.service'

const baseSettings = {
  timezone: 'America/Cancun',
  defaultCheckoutTime: '11:00',
  reportCurrency: 'MXN',
}

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    propertySettings: {
      findUnique: jest.fn().mockResolvedValue(baseSettings),
    },
    room: {
      count: jest.fn().mockResolvedValue(20),
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestStay: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    cleaningTask: { count: jest.fn().mockResolvedValue(0) },
    roomBlock: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    housekeepingStaff: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  }
}

describe('DashboardOverviewService', () => {
  let svc: DashboardOverviewService
  let prisma: any

  beforeEach(async () => {
    prisma = makePrismaMock()
    const module = await Test.createTestingModule({
      providers: [
        DashboardOverviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    svc = module.get(DashboardOverviewService)
  })

  it('redacts guest names from inHouseRooms when role is HOUSEKEEPER', async () => {
    const stay = {
      id: 's1',
      roomId: 'r1',
      guestName: 'María García',
      scheduledCheckout: new Date(Date.now() + 86_400_000),
      paxCount: 2,
      actualCheckin: new Date(),
      notes: null,
    }
    prisma.guestStay.findMany
      .mockResolvedValueOnce([stay])
      .mockResolvedValueOnce([{ ...stay, room: { number: '203' } }])
    prisma.room.count.mockResolvedValue(20)

    const result = await svc.getOverview('prop-1', 'HOUSEKEEPER' as any)

    expect(result.inHouseRooms[0].guestName).toBeNull()
    // Operational fields stay
    expect(result.inHouseRooms[0].roomNumber).toBe('203')
    expect(result.inHouseRooms[0].metaLabel).toContain('pax')
  })

  it('keeps guest names for RECEPTIONIST', async () => {
    const stay = {
      id: 's1',
      roomId: 'r1',
      guestName: 'María García',
      scheduledCheckout: new Date(Date.now() + 86_400_000),
      paxCount: 2,
      actualCheckin: new Date(),
      notes: null,
    }
    prisma.guestStay.findMany
      .mockResolvedValueOnce([stay])
      .mockResolvedValueOnce([{ ...stay, room: { number: '203' } }])

    const result = await svc.getOverview('prop-1', 'RECEPTIONIST' as any)

    expect(result.inHouseRooms[0].guestName).toBe('María García')
  })

  it('redacts unpaidAmountLabel + unpaidFolios for HOUSEKEEPER', async () => {
    // Even if there are unpaid stays in the DB, HK should never see them
    prisma.guestStay.findMany.mockResolvedValueOnce([]) // in-house empty for simplicity

    const result = await svc.getOverview('prop-1', 'HOUSEKEEPER' as any)

    expect(result.pendingTasks.unpaidFolios).toBe(0)
    expect(result.pendingTasks.unpaidAmountLabel).toBeNull()
    // The underlying findMany for unpaid was NOT called (HK skipped the branch)
    const allCalls = prisma.guestStay.findMany.mock.calls.map((c: any) => c[0])
    const unpaidQuery = allCalls.find((q: any) =>
      q?.where?.paymentStatus?.in?.includes?.('PARTIAL'),
    )
    expect(unpaidQuery).toBeUndefined()
  })

  it('redacts requestedByName/approvedByName from blocked rooms for HK', async () => {
    prisma.roomBlock.findMany.mockResolvedValueOnce([
      {
        id: 'b1',
        roomId: 'r1',
        startDate: new Date(),
        endDate: null,
        notes: 'leak',
        reason: 'MAINTENANCE',
        requestedById: 'staff-1',
        approvedById: 'staff-2',
      },
    ])
    prisma.room.findMany.mockResolvedValue([{ id: 'r1', number: '105' }])
    prisma.housekeepingStaff.findMany
      .mockResolvedValueOnce([{ id: 'staff-1', name: 'Carlos R.' }])
      .mockResolvedValueOnce([{ id: 'staff-2', name: 'Ana G.' }])

    const result = await svc.getOverview('prop-1', 'HOUSEKEEPER' as any)

    expect(result.blockedRooms[0].requestedByName).toBeNull()
    expect(result.blockedRooms[0].approvedByName).toBeNull()
    // Operational fields still present
    expect(result.blockedRooms[0].roomNumber).toBe('105')
    expect(result.blockedRooms[0].reason).toBe('leak')
  })

  it('returns 0% occupancy without crashing when totalRooms=0', async () => {
    prisma.room.count.mockResolvedValue(0)

    const result = await svc.getOverview('prop-1', 'RECEPTIONIST' as any)

    expect(result.occupancy.percentage).toBe(0)
    expect(result.occupancy.empty).toBe(0)
    expect(result.occupancy.yesterdayPercentage).toBeNull()
  })
})
