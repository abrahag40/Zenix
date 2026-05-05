/**
 * RevenueReportService — privacy + math edge cases.
 *
 * The full 7-frame composition is exercised live (curl integration test).
 * These specs lock down:
 *   1. HK is rejected with ForbiddenException
 *   2. Empty stays don't divide by zero
 *   3. Currency from settings flows through to all frames
 */

import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RevenueReportService } from './revenue-report.service'
import { PrismaService } from '../prisma/prisma.service'

function makePrismaMock() {
  return {
    propertySettings: {
      findUnique: jest.fn().mockResolvedValue({
        timezone: 'America/Cancun',
        reportCurrency: 'MXN',
        weeklyRevenueTarget: null,
      }),
    },
    room: { count: jest.fn().mockResolvedValue(20) },
    guestStay: { findMany: jest.fn().mockResolvedValue([]) },
    roomBlock: { count: jest.fn().mockResolvedValue(0) },
    paymentLog: { findMany: jest.fn().mockResolvedValue([]) },
    channelCommission: { findMany: jest.fn().mockResolvedValue([]) },
  }
}

describe('RevenueReportService', () => {
  let svc: RevenueReportService
  let prisma: any

  beforeEach(async () => {
    prisma = makePrismaMock()
    const module = await Test.createTestingModule({
      providers: [
        RevenueReportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    svc = module.get(RevenueReportService)
  })

  it('rejects HOUSEKEEPER with ForbiddenException', async () => {
    await expect(
      svc.getSnapshot('prop-1', 'HOUSEKEEPER' as any),
    ).rejects.toThrow(ForbiddenException)
  })

  it('returns 7 frames in stable order', async () => {
    const result = await svc.getSnapshot('prop-1', 'RECEPTIONIST' as any)

    expect(result.frames.map((f) => f.id)).toEqual([
      'today',
      'adr',
      'revpar',
      'topChannel',
      'commissions',
      'cashOnHand',
      'forecastWeek',
    ])
  })

  it('handles empty data without dividing by zero', async () => {
    // Already mocked empty stays + 0 blocks + 0 cash. Should not throw
    // and should return $0-ish values across all frames.
    const result = await svc.getSnapshot('prop-1', 'RECEPTIONIST' as any)

    expect(result.frames).toHaveLength(7)
    // No NaN strings — every primaryWhole has either $ or a non-numeric label
    for (const f of result.frames) {
      expect(f.primaryWhole).not.toContain('NaN')
    }
  })

  it('threads currency from PropertySettings into every monetary frame', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      timezone: 'America/Cancun',
      reportCurrency: 'USD',
      weeklyRevenueTarget: null,
    })

    const result = await svc.getSnapshot('prop-1', 'RECEPTIONIST' as any)

    expect(result.currency).toBe('USD')
    // Spot-check: INGRESOS HOY uses currency in suffix
    const today = result.frames.find((f) => f.id === 'today')
    expect(today?.primarySuffix).toBe('USD')
  })

  it('uses fallback commission rates when no ChannelCommission rows exist', async () => {
    prisma.guestStay.findMany.mockResolvedValueOnce([
      {
        id: 's1', roomId: 'r1',
        ratePerNight: '1000',
        totalAmount: '1000', amountPaid: '0',
        paymentStatus: 'PENDING',
        source: 'BOOKING',
        checkinAt: new Date(), scheduledCheckout: new Date(Date.now() + 86_400_000),
      },
    ])

    const result = await svc.getSnapshot('prop-1', 'RECEPTIONIST' as any)
    const commissions = result.frames.find((f) => f.id === 'commissions')

    // BOOKING fallback rate is 15% → $150 of $1000
    expect(commissions?.primaryWhole).toBe('$150')
    expect(commissions?.caption).toContain('usando defaults')
  })
})
