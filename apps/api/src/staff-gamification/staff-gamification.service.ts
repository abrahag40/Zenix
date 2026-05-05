/**
 * StaffGamificationService — privacy-first gamification engine.
 *
 * Anclado a docs/research-housekeeping-hub.md.
 *
 * Principios:
 *   - Privacy peer-to-peer (D9): solo el propio staff y su supervisor
 *     ven los datos. NO leaderboards, NO ranking, NO comparación entre
 *     pares.
 *   - SDT (Deci & Ryan 1985): autonomía (freezes, opt-out), competencia
 *     (PRs visibles), relación (oxitocina via supervisor thank-you).
 *   - Variable Ratio Reinforcement (Skinner) con cap diario para evitar
 *     desensibilización (Mekler 2017).
 *
 * Hooks de invocación:
 *   - `onTaskCompleted(staffId, task)` — invocado por TasksService al
 *     pasar status → DONE. Actualiza daily activity + checks PR + streak.
 *   - `onTaskVerified(staffId, task)` — invocado al verificar (incrementa
 *     ring 3).
 *   - cron diario 00:30 local — roll-over de streaks.
 *   - cron mensual — reset de freezes.
 */

import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface StreakSummary {
  currentDays: number
  longestDays: number
  freezesAvailable: number
  freezesTotal: number
  lastWorkDate: string | null
  isAtRisk: boolean
}

export interface PersonalRecordSummary {
  roomCategory: string
  /** Pre-formatted "22 min". */
  bestLabel: string
  bestMinutes: number
  achievedAt: string
}

export interface DailyRingsSummary {
  date: string
  /** Each ring 0-100. Closing requires reaching 100. */
  tasksRing: { value: number; target: number; pct: number }
  minutesRing: { value: number; target: number; pct: number }
  verifiedRing: { value: number; target: number; pct: number }
  ringsCompleted: boolean
}

@Injectable()
export class StaffGamificationService {
  private readonly log = new Logger(StaffGamificationService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── Read APIs ─────────────────────────────────────────────────────

  /** Returns the streak for the calling staff. Private to actor. */
  async getStreak(actorStaffId: string, targetStaffId: string): Promise<StreakSummary> {
    this.assertOwnerOrSupervisor(actorStaffId, targetStaffId)
    const row = await this.prisma.staffStreak.upsert({
      where: { staffId: targetStaffId },
      update: {},
      create: { staffId: targetStaffId },
    })
    return this.toStreakSummary(row)
  }

  async getPersonalRecords(
    actorStaffId: string,
    targetStaffId: string,
  ): Promise<PersonalRecordSummary[]> {
    this.assertOwnerOrSupervisor(actorStaffId, targetStaffId)
    const rows = await this.prisma.staffPersonalRecord.findMany({
      where: { staffId: targetStaffId },
      orderBy: { bestMinutes: 'asc' },
    })
    return rows.map((r) => ({
      roomCategory: r.roomCategory,
      bestLabel: `${r.bestMinutes} min`,
      bestMinutes: r.bestMinutes,
      achievedAt: r.achievedAt.toISOString(),
    }))
  }

  async getDailyRings(
    actorStaffId: string,
    targetStaffId: string,
    date: string,
  ): Promise<DailyRingsSummary> {
    this.assertOwnerOrSupervisor(actorStaffId, targetStaffId)
    const dateObj = new Date(`${date}T00:00:00.000Z`)
    const row = await this.prisma.staffDailyActivity.findUnique({
      where: { staffId_date: { staffId: targetStaffId, date: dateObj } },
    })

    // Defaults: 6 tasks · 240 min · 4 verified — adjustable per-property
    // in Sprint 9+. For Sprint 8I-J these are sane operational averages.
    const tasksTarget = row?.tasksTarget ?? 6
    const minutesTarget = row?.minutesTarget ?? 240
    const verifiedTarget = row?.verifiedTarget ?? 4

    const tasks = row?.tasksCompleted ?? 0
    const minutes = row?.totalCleaningMinutes ?? 0
    const verified = row?.tasksVerified ?? 0

    const safePct = (v: number, t: number) =>
      t === 0 ? 0 : Math.min(100, Math.round((v / t) * 100))

    return {
      date,
      tasksRing: {
        value: tasks,
        target: tasksTarget,
        pct: safePct(tasks, tasksTarget),
      },
      minutesRing: {
        value: minutes,
        target: minutesTarget,
        pct: safePct(minutes, minutesTarget),
      },
      verifiedRing: {
        value: verified,
        target: verifiedTarget,
        pct: safePct(verified, verifiedTarget),
      },
      ringsCompleted: row?.ringsCompleted ?? false,
    }
  }

  // ── Mutation APIs (invoked by TasksService) ──────────────────────

  /**
   * Called when a CleaningTask transitions to DONE. Updates:
   *   1. Daily activity counters
   *   2. Personal record check (if cleaning duration < current best)
   *   3. Streak roll-forward (if first DONE today)
   *   4. Rings-completion flag (if all 3 thresholds met)
   *
   * Runs in fire-and-forget mode from TasksService — never blocks the
   * task transaction.
   */
  async onTaskCompleted(args: {
    staffId: string
    taskId: string
    cleaningMinutes: number
    roomCategory: string
    /** Date of the work in property-local YMD. */
    workDate: string
  }): Promise<void> {
    const { staffId, taskId, cleaningMinutes, roomCategory, workDate } = args
    const dateObj = new Date(`${workDate}T00:00:00.000Z`)

    // 1. Increment daily activity (upsert)
    const activity = await this.prisma.staffDailyActivity.upsert({
      where: { staffId_date: { staffId, date: dateObj } },
      update: {
        tasksCompleted: { increment: 1 },
        totalCleaningMinutes: { increment: cleaningMinutes },
      },
      create: {
        staffId,
        date: dateObj,
        tasksCompleted: 1,
        totalCleaningMinutes: cleaningMinutes,
        // Default targets — Sprint 9 derives from PropertySettings.
        tasksTarget: 6,
        minutesTarget: 240,
        verifiedTarget: 4,
      },
    })

    // 2. Personal record check
    await this.checkPersonalRecord(staffId, taskId, roomCategory, cleaningMinutes)

    // 3. Streak roll-forward
    await this.rollStreak(staffId, workDate)

    // 4. Rings completion
    await this.checkRingsCompletion(activity.id, activity)
  }

  async onTaskVerified(args: {
    staffId: string
    workDate: string
  }): Promise<void> {
    const { staffId, workDate } = args
    const dateObj = new Date(`${workDate}T00:00:00.000Z`)
    const activity = await this.prisma.staffDailyActivity.upsert({
      where: { staffId_date: { staffId, date: dateObj } },
      update: { tasksVerified: { increment: 1 } },
      create: {
        staffId,
        date: dateObj,
        tasksVerified: 1,
        tasksTarget: 6,
        minutesTarget: 240,
        verifiedTarget: 4,
      },
    })
    await this.checkRingsCompletion(activity.id, activity)
  }

  /**
   * Use a freeze — staff opts to preserve streak during a planned absence
   * (autonomy SDT). Limited to `freezesTotal` per month.
   */
  async useFreeze(
    actorStaffId: string,
    targetStaffId: string,
  ): Promise<{ ok: true; freezesAvailable: number } | { ok: false; reason: string }> {
    this.assertOwnerOrSupervisor(actorStaffId, targetStaffId)
    const row = await this.prisma.staffStreak.findUnique({
      where: { staffId: targetStaffId },
    })
    if (!row) return { ok: false, reason: 'no streak' }
    if (row.freezesUsed >= row.freezesTotal) {
      return { ok: false, reason: 'no freezes available this month' }
    }
    const updated = await this.prisma.staffStreak.update({
      where: { staffId: targetStaffId },
      data: { freezesUsed: { increment: 1 } },
    })
    return { ok: true, freezesAvailable: updated.freezesTotal - updated.freezesUsed }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async checkPersonalRecord(
    staffId: string,
    taskId: string,
    roomCategory: string,
    cleaningMinutes: number,
  ): Promise<void> {
    if (cleaningMinutes <= 0) return // protect against bad data
    const existing = await this.prisma.staffPersonalRecord.findUnique({
      where: { staffId_roomCategory: { staffId, roomCategory } },
    })
    const isPR = !existing || cleaningMinutes < existing.bestMinutes
    if (!isPR) return
    await this.prisma.staffPersonalRecord.upsert({
      where: { staffId_roomCategory: { staffId, roomCategory } },
      create: {
        staffId,
        roomCategory,
        bestMinutes: cleaningMinutes,
        achievedAt: new Date(),
        taskId,
      },
      update: {
        bestMinutes: cleaningMinutes,
        achievedAt: new Date(),
        taskId,
      },
    })
  }

  private async rollStreak(staffId: string, workDate: string): Promise<void> {
    const today = new Date(`${workDate}T00:00:00.000Z`)
    const row = await this.prisma.staffStreak.findUnique({ where: { staffId } })

    if (!row) {
      await this.prisma.staffStreak.create({
        data: {
          staffId,
          currentDays: 1,
          longestDays: 1,
          lastWorkDate: today,
        },
      })
      return
    }

    if (row.lastWorkDate && this.isSameDate(row.lastWorkDate, today)) {
      // Already rolled today — no-op
      return
    }

    const last = row.lastWorkDate
    const yesterday = new Date(today.getTime() - 86_400_000)
    let nextCurrent: number
    if (last && this.isSameDate(last, yesterday)) {
      nextCurrent = row.currentDays + 1
    } else {
      // Gap — for Sprint 8I-J we reset to 1. Freeze logic refines this in
      // Sprint 9 (cron checks shift exceptions to auto-apply freezes).
      nextCurrent = 1
    }

    const nextLongest = Math.max(row.longestDays, nextCurrent)

    await this.prisma.staffStreak.update({
      where: { staffId },
      data: {
        currentDays: nextCurrent,
        longestDays: nextLongest,
        lastWorkDate: today,
      },
    })
  }

  private async checkRingsCompletion(
    activityId: string,
    activity: {
      tasksCompleted: number
      tasksTarget: number
      totalCleaningMinutes: number
      minutesTarget: number
      tasksVerified: number
      verifiedTarget: number
      ringsCompleted: boolean
    },
  ): Promise<void> {
    if (activity.ringsCompleted) return
    const ring1 = activity.tasksCompleted >= activity.tasksTarget
    const ring2 = activity.totalCleaningMinutes >= activity.minutesTarget
    const ring3 = activity.tasksVerified >= activity.verifiedTarget
    if (ring1 && ring2 && ring3) {
      await this.prisma.staffDailyActivity.update({
        where: { id: activityId },
        data: { ringsCompleted: true },
      })
    }
  }

  private toStreakSummary(row: {
    currentDays: number
    longestDays: number
    freezesUsed: number
    freezesTotal: number
    lastWorkDate: Date | null
  }): StreakSummary {
    const isAtRisk = !!row.lastWorkDate && !this.isSameDate(row.lastWorkDate, new Date())
    return {
      currentDays: row.currentDays,
      longestDays: row.longestDays,
      freezesAvailable: Math.max(0, row.freezesTotal - row.freezesUsed),
      freezesTotal: row.freezesTotal,
      lastWorkDate: row.lastWorkDate?.toISOString().slice(0, 10) ?? null,
      isAtRisk,
    }
  }

  private isSameDate(a: Date, b: Date): boolean {
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
  }

  /**
   * Privacy guard: the actor must be the owner of the data OR a
   * supervisor in the same property. Prevents peer access entirely.
   *
   * For Sprint 8I-J we accept owner-self only. Sprint 9 extends to
   * SUPERVISOR with org-scope check via TenantContextService.
   */
  private assertOwnerOrSupervisor(actorStaffId: string, targetStaffId: string): void {
    if (actorStaffId !== targetStaffId) {
      throw new ForbiddenException(
        'Gamification data is private to the staff member (D9 — peer-to-peer privacy)',
      )
    }
  }
}
