/**
 * AvailabilityQueryService — fuente de verdad de "quién está en turno".
 *
 * Resuelve, para una propiedad y un instante específico, qué staff está actualmente
 * trabajando según:
 *   1. StaffShiftException — excepciones puntuales (vacación, día libre, turno extra)
 *      tienen precedencia ABSOLUTA sobre el horario semanal recurrente.
 *   2. StaffShift — horario semanal recurrente (LUN-DOM, HH:mm-HH:mm).
 *
 * Multi-timezone (CRÍTICO §14 CLAUDE.md):
 *   Toda comparación de hora se hace en LA TIMEZONE LOCAL DE LA PROPIEDAD usando
 *   `Intl.DateTimeFormat`. Nunca en UTC. Nunca con `new Date().getDay()`.
 *
 * Performance:
 *   Una sola query a StaffShiftException + una a StaffShift. Resolución en memoria.
 *   El consumidor típico (MorningRosterScheduler, AssignmentService) llama esto
 *   varias veces por minuto en horarios pico. Cache opcional puede agregarse después.
 */
import { Injectable, Logger } from '@nestjs/common'
import { Capability, HousekeepingRole, OnShiftStaffDto } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'

function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toLocalDayOfWeek(date: Date, timezone: string): number {
  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date)
  // 0=Sun, 1=Mon, ..., 6=Sat — ordering matches schema convention (StaffShift.dayOfWeek).
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[weekdayShort] ?? 0
}

function toLocalTime(date: Date, timezone: string): string {
  // Returns "HH:mm" in 24-hour format (matches StaffShift.startTime/endTime).
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  // en-GB returns "HH:mm" — sanity check: replace 24:NN with 00:NN (Intl edge case at midnight)
  return formatted.startsWith('24:') ? `00:${formatted.slice(3)}` : formatted
}

/** Returns true if `time` (HH:mm) falls within [start, end). Wraps if end < start (overnight shift). */
function isWithinShift(time: string, start: string, end: string): boolean {
  if (start === end) return false  // empty shift, ignore
  if (end > start) return time >= start && time < end
  // Overnight shift: e.g., 22:00 - 06:00 → time in [22:00, 24:00) OR [00:00, 06:00)
  return time >= start || time < end
}

@Injectable()
export class AvailabilityQueryService {
  private readonly logger = new Logger(AvailabilityQueryService.name)

  constructor(private prisma: PrismaService) {}

  /**
   * Returns the list of staff currently on shift at the given instant for the given property.
   * Excludes staff with active StaffShiftException(OFF) for today's local date.
   *
   * @param propertyId  Property to query
   * @param atInstant   Moment to evaluate (default: now)
   */
  async getOnShiftStaff(propertyId: string, atInstant: Date = new Date()): Promise<OnShiftStaffDto[]> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { timezone: true },
    })
    const tz = settings?.timezone || 'UTC'

    const localDate = toLocalDate(atInstant, tz)
    const localDay  = toLocalDayOfWeek(atInstant, tz)
    const localTime = toLocalTime(atInstant, tz)
    const localDateMidnightUtc = new Date(`${localDate}T00:00:00.000Z`)

    // 1. Load all exceptions for this date — they take precedence
    const exceptions = await this.prisma.staffShiftException.findMany({
      where: { date: localDateMidnightUtc },
      select: {
        staffId: true,
        type: true,
        startTime: true,
        endTime: true,
      },
    })
    const exceptionByStaff = new Map(exceptions.map(e => [e.staffId, e] as const))

    // 2. Load recurring shifts for this property + day-of-week
    const shifts = await this.prisma.staffShift.findMany({
      where: {
        propertyId,
        dayOfWeek: localDay,
        active: true,
        effectiveFrom: { lte: localDateMidnightUtc },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: localDateMidnightUtc } },
        ],
        staff: { active: true, deletedAt: null },
      },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            role: true,
            capabilities: true,
          },
        },
      },
    })

    const onShift: OnShiftStaffDto[] = []

    // Track staff already added so we don't duplicate (shouldn't happen given unique
    // constraint per [staffId, date] on exceptions, but defensive).
    const seen = new Set<string>()

    // Process recurring shifts first; exceptions override below.
    for (const shift of shifts) {
      const exc = exceptionByStaff.get(shift.staffId)
      if (exc?.type === 'OFF') continue                                          // explicit absence
      if (exc?.type === 'MODIFIED') continue                                     // handled below
      if (!isWithinShift(localTime, shift.startTime, shift.endTime)) continue
      if (seen.has(shift.staffId)) continue
      seen.add(shift.staffId)
      onShift.push({
        staffId: shift.staff.id,
        name: shift.staff.name,
        role: shift.staff.role as HousekeepingRole,
        capabilities: shift.staff.capabilities as Capability[],
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        source: 'RECURRING',
      })
    }

    // Process exceptions of type EXTRA / MODIFIED
    if (exceptions.length > 0) {
      const exceptionStaffIds = exceptions
        .filter(e => e.type !== 'OFF')
        .map(e => e.staffId)
      if (exceptionStaffIds.length > 0) {
        const exceptionStaffRows = await this.prisma.housekeepingStaff.findMany({
          where: {
            id: { in: exceptionStaffIds },
            propertyId,
            active: true,
            deletedAt: null,
          },
          select: { id: true, name: true, role: true, capabilities: true },
        })
        const staffMap = new Map(exceptionStaffRows.map(s => [s.id, s] as const))

        for (const exc of exceptions) {
          if (exc.type === 'OFF') continue
          if (!exc.startTime || !exc.endTime) continue
          if (!isWithinShift(localTime, exc.startTime, exc.endTime)) continue
          const staff = staffMap.get(exc.staffId)
          if (!staff) continue
          if (seen.has(staff.id)) continue
          seen.add(staff.id)
          onShift.push({
            staffId: staff.id,
            name: staff.name,
            role: staff.role as HousekeepingRole,
            capabilities: staff.capabilities as Capability[],
            shiftStart: exc.startTime,
            shiftEnd: exc.endTime,
            source: exc.type as 'EXTRA' | 'MODIFIED',
          })
        }
      }
    }

    return onShift
  }

  /**
   * Tests if a single staff member is on shift at the given instant. More efficient
   * than getOnShiftStaff() when you only care about one person.
   */
  async isStaffOnShift(staffId: string, propertyId: string, atInstant: Date = new Date()): Promise<boolean> {
    const onShift = await this.getOnShiftStaff(propertyId, atInstant)
    return onShift.some(s => s.staffId === staffId)
  }

  /**
   * Returns staff scheduled to work at any point between [from, to] for a given property.
   * Used by MorningRosterScheduler to know who will be available throughout the day,
   * not just at the moment the cron fires.
   */
  async getStaffOnShiftToday(propertyId: string, atInstant: Date = new Date()): Promise<OnShiftStaffDto[]> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { timezone: true },
    })
    const tz = settings?.timezone || 'UTC'

    const localDate = toLocalDate(atInstant, tz)
    const localDay  = toLocalDayOfWeek(atInstant, tz)
    const localDateMidnightUtc = new Date(`${localDate}T00:00:00.000Z`)

    const exceptions = await this.prisma.staffShiftException.findMany({
      where: { date: localDateMidnightUtc },
      select: { staffId: true, type: true, startTime: true, endTime: true },
    })
    const exceptionByStaff = new Map(exceptions.map(e => [e.staffId, e] as const))

    const shifts = await this.prisma.staffShift.findMany({
      where: {
        propertyId,
        dayOfWeek: localDay,
        active: true,
        effectiveFrom: { lte: localDateMidnightUtc },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: localDateMidnightUtc } },
        ],
        staff: { active: true, deletedAt: null },
      },
      include: {
        staff: { select: { id: true, name: true, role: true, capabilities: true } },
      },
    })

    const result: OnShiftStaffDto[] = []
    const seen = new Set<string>()

    for (const shift of shifts) {
      const exc = exceptionByStaff.get(shift.staffId)
      if (exc?.type === 'OFF') continue
      if (exc?.type === 'MODIFIED') {
        // Replace recurring shift with the modified one
        if (!exc.startTime || !exc.endTime) continue
        if (seen.has(shift.staffId)) continue
        seen.add(shift.staffId)
        result.push({
          staffId: shift.staff.id,
          name: shift.staff.name,
          role: shift.staff.role as HousekeepingRole,
          capabilities: shift.staff.capabilities as Capability[],
          shiftStart: exc.startTime,
          shiftEnd: exc.endTime,
          source: 'MODIFIED',
        })
        continue
      }
      if (seen.has(shift.staffId)) continue
      seen.add(shift.staffId)
      result.push({
        staffId: shift.staff.id,
        name: shift.staff.name,
        role: shift.staff.role as HousekeepingRole,
        capabilities: shift.staff.capabilities as Capability[],
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        source: 'RECURRING',
      })
    }

    // Add EXTRA shifts (staff on overtime today)
    const extras = exceptions.filter(e => e.type === 'EXTRA')
    if (extras.length > 0) {
      const staffRows = await this.prisma.housekeepingStaff.findMany({
        where: {
          id: { in: extras.map(e => e.staffId) },
          propertyId,
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true, role: true, capabilities: true },
      })
      const staffMap = new Map(staffRows.map(s => [s.id, s] as const))

      for (const exc of extras) {
        if (!exc.startTime || !exc.endTime) continue
        const staff = staffMap.get(exc.staffId)
        if (!staff) continue
        if (seen.has(staff.id)) continue
        seen.add(staff.id)
        result.push({
          staffId: staff.id,
          name: staff.name,
          role: staff.role as HousekeepingRole,
          capabilities: staff.capabilities as Capability[],
          shiftStart: exc.startTime,
          shiftEnd: exc.endTime,
          source: 'EXTRA',
        })
      }
    }

    return result
  }

  // ── Helpers exportados para tests ──────────────────────────────────────────
  static _toLocalDate = toLocalDate
  static _toLocalDayOfWeek = toLocalDayOfWeek
  static _toLocalTime = toLocalTime
  static _isWithinShift = isWithinShift
}
