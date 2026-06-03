import { Test, TestingModule } from '@nestjs/testing'
import { MetricsService } from './metrics.service'
import { PrismaService } from '../../prisma/prisma.service'

const PROP = 'prop-1'
const ORG = 'org-1'
const DATE = new Date('2026-07-10T12:00:00.000Z')

describe('MetricsService.computeDailySnapshot — KPIs USALI', () => {
  let service: MetricsService
  const prisma = {
    guestStay: { findMany: jest.fn(), count: jest.fn() },
    room: { count: jest.fn() },
    metricsDailySnapshot: { upsert: jest.fn().mockImplementation((args) => Promise.resolve(args.create)) },
  }

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [MetricsService, { provide: PrismaService, useValue: prisma }],
    }).compile()
    service = mod.get(MetricsService)
    jest.clearAllMocks()
  })

  it('calcula ocupación, ADR, RevPAR, channel mix y revenue por room type', async () => {
    // occupying (3 rooms distintos) → arrivals (1)
    prisma.guestStay.findMany
      .mockResolvedValueOnce([
        { roomId: 'r1', ratePerNight: 100, currency: 'USD', source: 'booking', room: { roomTypeId: 'rt1' } },
        { roomId: 'r2', ratePerNight: 200, currency: 'USD', source: 'direct', room: { roomTypeId: 'rt1' } },
        { roomId: 'r3', ratePerNight: 150, currency: 'USD', source: 'booking', room: { roomTypeId: 'rt2' } },
      ])
      .mockResolvedValueOnce([
        { checkinAt: new Date('2026-07-10T15:00:00Z'), scheduledCheckout: new Date('2026-07-13T12:00:00Z'), bookingLeadDays: 10 },
      ])
    prisma.room.count.mockResolvedValue(10)
    // count: cancellations, noShows (Promise.all), luego departures
    prisma.guestStay.count
      .mockResolvedValueOnce(2) // cancellations
      .mockResolvedValueOnce(1) // no-shows
      .mockResolvedValueOnce(2) // departures

    await service.computeDailySnapshot(PROP, ORG, DATE)

    const data = prisma.metricsDailySnapshot.upsert.mock.calls[0][0].create
    expect(data.roomsSold).toBe(3)
    expect(data.totalRoomsAvailable).toBe(10)
    expect(data.occupancyPercent).toBe(30)         // 3/10
    expect(data.roomRevenue).toBe(450)             // 100+200+150
    expect(data.adr).toBe(150)                     // 450/3
    expect(data.revpar).toBe(45)                   // 450/10
    expect(data.cancellationsCount).toBe(2)
    expect(data.noShowsCount).toBe(1)
    expect(data.arrivalsCount).toBe(1)
    expect(data.departuresCount).toBe(2)
    expect(data.avgLengthOfStay).toBe(3)           // 10→13 jul = 3 noches
    expect(data.avgLeadTime).toBe(10)
    expect(data.channelMix).toEqual({ BOOKING: 2, DIRECT: 1 })
    expect(data.revenueByRoomType).toEqual({ rt1: { rooms: 2, revenue: 300 }, rt2: { rooms: 1, revenue: 150 } })
    expect(data.baseCurrency).toBe('USD')
  })

  it('property vacía → ocupación/ADR/RevPAR en 0 (sin división por cero)', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    prisma.room.count.mockResolvedValue(8)
    prisma.guestStay.count.mockResolvedValue(0)

    await service.computeDailySnapshot(PROP, ORG, DATE)
    const data = prisma.metricsDailySnapshot.upsert.mock.calls[0][0].create
    expect(data.roomsSold).toBe(0)
    expect(data.occupancyPercent).toBe(0)
    expect(data.adr).toBe(0)
    expect(data.revpar).toBe(0)
    expect(data.avgLengthOfStay).toBeNull()
  })

  it('upsert idempotente por [property, date] (re-correr es seguro)', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    prisma.room.count.mockResolvedValue(5)
    prisma.guestStay.count.mockResolvedValue(0)
    await service.computeDailySnapshot(PROP, ORG, DATE)
    const where = prisma.metricsDailySnapshot.upsert.mock.calls[0][0].where
    expect(where).toEqual({ propertyId_date: { propertyId: PROP, date: new Date('2026-07-10T00:00:00.000Z') } })
  })
})
