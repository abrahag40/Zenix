/**
 * ClockService — clock-in / clock-out de staff (USALI auditability).
 *
 * Append-only: nunca se actualiza un clock-in ya cerrado. Para correcciones,
 * el supervisor crea un nuevo registro con source=MANUAL_SUPERVISOR.
 *
 * Reglas:
 *   - clockIn: si hay un clock open (clockOutAt=null), error → "Already clocked in".
 *   - clockOut: actualiza el último clock open del staff. Si no hay → error.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ClockSource } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { ClockInDto, ClockOutDto } from './dto/clock.dto'

@Injectable()
export class ClockService {
  constructor(private prisma: PrismaService) {}

  async clockIn(staffId: string, propertyId: string, dto: ClockInDto) {
    const open = await this.prisma.staffShiftClock.findFirst({
      where: { staffId, clockOutAt: null },
      select: { id: true },
    })
    if (open) throw new ConflictException('Staff is already clocked in (open shift exists)')

    return this.prisma.staffShiftClock.create({
      data: {
        staffId,
        propertyId,
        clockInAt: new Date(),
        source: dto.source ?? ClockSource.MOBILE,
        notes: dto.notes,
      },
    })
  }

  async clockOut(staffId: string, dto: ClockOutDto) {
    const open = await this.prisma.staffShiftClock.findFirst({
      where: { staffId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    })
    if (!open) throw new NotFoundException('No open shift to clock out')

    return this.prisma.staffShiftClock.update({
      where: { id: open.id },
      data: {
        clockOutAt: new Date(),
        notes: dto.notes ? (open.notes ? `${open.notes}\n${dto.notes}` : dto.notes) : open.notes,
      },
    })
  }

  async listForStaff(staffId: string, fromDate?: string, toDate?: string) {
    const where: { staffId: string; clockInAt?: { gte?: Date; lte?: Date } } = { staffId }
    if (fromDate || toDate) {
      where.clockInAt = {}
      if (fromDate) where.clockInAt.gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) where.clockInAt.lte = new Date(`${toDate}T23:59:59.999Z`)
    }
    return this.prisma.staffShiftClock.findMany({
      where,
      orderBy: { clockInAt: 'desc' },
    })
  }

  async getOpenShift(staffId: string) {
    return this.prisma.staffShiftClock.findFirst({
      where: { staffId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    })
  }
}
