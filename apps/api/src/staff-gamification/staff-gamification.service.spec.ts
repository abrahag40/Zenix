/**
 * StaffGamificationService — privacy + correctness contracts.
 *
 * What we lock down:
 *   1. Privacy peer-to-peer (D9): peer access throws Forbidden
 *   2. Streak roll forward when worked yesterday
 *   3. Streak resets to 1 when there's a gap (Sprint 8I-J behavior;
 *      Sprint 9 will refine via shift-aware freezes)
 *   4. Personal record only updates when the new time is BETTER
 *   5. Rings completion flag flips when all 3 thresholds met
 */

import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { StaffGamificationService } from './staff-gamification.service'
import { PrismaService } from '../prisma/prisma.service'

function makePrismaMock() {
  return {
    staffStreak: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    staffPersonalRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    staffDailyActivity: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  }
}

describe('StaffGamificationService', () => {
  let svc: StaffGamificationService
  let prisma: any

  beforeEach(async () => {
    prisma = makePrismaMock()
    const module = await Test.createTestingModule({
      providers: [
        StaffGamificationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    svc = module.get(StaffGamificationService)
  })

  // ── Privacy contract (D9) ───────────────────────────────────────
  describe('privacy peer-to-peer (D9)', () => {
    it('throws ForbiddenException when actor reads another staff streak', async () => {
      await expect(
        svc.getStreak('actor-1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when actor reads another staff records', async () => {
      await expect(
        svc.getPersonalRecords('actor-1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when actor reads another staff rings', async () => {
      await expect(
        svc.getDailyRings('actor-1', 'someone-else', '2026-05-01'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('allows owner to read their own streak', async () => {
      prisma.staffStreak.upsert.mockResolvedValue({
        currentDays: 7,
        longestDays: 14,
        freezesUsed: 0,
        freezesTotal: 2,
        lastWorkDate: null,
      })
      const result = await svc.getStreak('staff-1', 'staff-1')
      expect(result.currentDays).toBe(7)
    })
  })

  // ── Personal record correctness ──────────────────────────────────
  describe('onTaskCompleted — personal record', () => {
    it('creates a new PR row when no previous record exists', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1',
        tasksCompleted: 1,
        tasksTarget: 6,
        totalCleaningMinutes: 22,
        minutesTarget: 240,
        tasksVerified: 0,
        verifiedTarget: 4,
        ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 22,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffPersonalRecord.upsert).toHaveBeenCalled()
      const args = prisma.staffPersonalRecord.upsert.mock.calls[0][0]
      expect(args.create.bestMinutes).toBe(22)
    })

    it('updates the PR when new time is better', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 18, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      // Existing PR is 22 min; new is 18 → should update
      prisma.staffPersonalRecord.findUnique.mockResolvedValue({
        bestMinutes: 22,
      })
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-2',
        cleaningMinutes: 18,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffPersonalRecord.upsert).toHaveBeenCalled()
      const args = prisma.staffPersonalRecord.upsert.mock.calls[0][0]
      expect(args.update.bestMinutes).toBe(18)
    })

    it('does NOT touch the PR when new time is WORSE', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 30, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue({
        bestMinutes: 22,
      })
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-3',
        cleaningMinutes: 30,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffPersonalRecord.upsert).not.toHaveBeenCalled()
    })
  })

  // ── Streak roll-forward ──────────────────────────────────────────
  describe('streak roll-forward', () => {
    it('creates streak with 1 day on first task ever', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 20, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffStreak.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentDays: 1,
            longestDays: 1,
          }),
        }),
      )
    })

    it('increments streak when last work was YESTERDAY', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 20, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue({
        currentDays: 5,
        longestDays: 7,
        lastWorkDate: new Date('2026-04-30T00:00:00.000Z'),
      })

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffStreak.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentDays: 6,
            longestDays: 7,
          }),
        }),
      )
    })

    it('resets streak to 1 when there is a gap (Sprint 8I-J behavior)', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 20, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      // Last worked 5 days ago — gap
      prisma.staffStreak.findUnique.mockResolvedValue({
        currentDays: 5,
        longestDays: 12,
        lastWorkDate: new Date('2026-04-26T00:00:00.000Z'),
      })

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffStreak.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentDays: 1,
            longestDays: 12,  // longest preserved
          }),
        }),
      )
    })

    it('grows longestDays when currentDays surpasses it (PR streak)', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1', tasksCompleted: 1, tasksTarget: 6,
        totalCleaningMinutes: 20, minutesTarget: 240,
        tasksVerified: 0, verifiedTarget: 4, ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue({
        currentDays: 12,
        longestDays: 12,  // matches — about to set new PR
        lastWorkDate: new Date('2026-04-30T00:00:00.000Z'),
      })

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffStreak.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentDays: 13,
            longestDays: 13,
          }),
        }),
      )
    })
  })

  // ── Rings completion ────────────────────────────────────────────
  describe('rings completion flag', () => {
    it('flips ringsCompleted=true when all 3 rings hit their target', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1',
        tasksCompleted: 6,
        tasksTarget: 6,
        totalCleaningMinutes: 240,
        minutesTarget: 240,
        tasksVerified: 4,
        verifiedTarget: 4,
        ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-final',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffDailyActivity.update).toHaveBeenCalledWith({
        where: { id: 'act-1' },
        data: { ringsCompleted: true },
      })
    })

    it('does NOT re-flip when ringsCompleted is already true', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1',
        tasksCompleted: 8,
        tasksTarget: 6,
        totalCleaningMinutes: 300,
        minutesTarget: 240,
        tasksVerified: 5,
        verifiedTarget: 4,
        ringsCompleted: true,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-extra',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffDailyActivity.update).not.toHaveBeenCalled()
    })

    it('does NOT flip when only 2 of 3 rings hit', async () => {
      prisma.staffDailyActivity.upsert.mockResolvedValue({
        id: 'act-1',
        tasksCompleted: 6,
        tasksTarget: 6,
        totalCleaningMinutes: 240,
        minutesTarget: 240,
        tasksVerified: 2,         // ← below 4
        verifiedTarget: 4,
        ringsCompleted: false,
      })
      prisma.staffPersonalRecord.findUnique.mockResolvedValue(null)
      prisma.staffStreak.findUnique.mockResolvedValue(null)

      await svc.onTaskCompleted({
        staffId: 'staff-1',
        taskId: 'task-1',
        cleaningMinutes: 20,
        roomCategory: 'PRIVATE',
        workDate: '2026-05-01',
      })

      expect(prisma.staffDailyActivity.update).not.toHaveBeenCalled()
    })
  })

  // ── Freezes ──────────────────────────────────────────────────────
  describe('freezes', () => {
    it('decrements freezesUsed when called and budget remains', async () => {
      prisma.staffStreak.findUnique.mockResolvedValue({
        freezesUsed: 0,
        freezesTotal: 2,
      })
      prisma.staffStreak.update.mockResolvedValue({
        freezesUsed: 1,
        freezesTotal: 2,
      })

      const result = await svc.useFreeze('staff-1', 'staff-1')

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.freezesAvailable).toBe(1)
    })

    it('refuses when no freezes available', async () => {
      prisma.staffStreak.findUnique.mockResolvedValue({
        freezesUsed: 2,
        freezesTotal: 2,
      })

      const result = await svc.useFreeze('staff-1', 'staff-1')

      expect(result.ok).toBe(false)
    })
  })
})
