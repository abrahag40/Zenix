/**
 * ShiftsService — CRUD de turnos semanales recurrentes y excepciones puntuales.
 *
 * Modelo conceptual:
 *   StaffShift            → turno recurrente (Lun-Dom × HH:mm-HH:mm)
 *   StaffShiftException   → override puntual (vacación, día libre, turno extra)
 *
 * Las excepciones tienen precedencia absoluta sobre los recurrentes
 * (ver AvailabilityQueryService para el algoritmo completo).
 */
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ShiftExceptionType } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import {
  CreateShiftDto,
  UpdateShiftDto,
  CreateShiftExceptionDto,
  CreateAbsenceDto,
} from './dto/shift.dto'

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name)

  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
  ) {}

  async listShifts(propertyId: string) {
    return this.prisma.staffShift.findMany({
      where: { propertyId, active: true },
      include: { staff: { select: { id: true, name: true, role: true } } },
      orderBy: [{ staffId: 'asc' }, { dayOfWeek: 'asc' }],
    })
  }

  async createShift(propertyId: string, dto: CreateShiftDto) {
    const orgId = this.tenant.getOrganizationId()
    if (dto.startTime >= dto.endTime && dto.startTime !== dto.endTime) {
      // Allow overnight shifts (start > end) but disallow start == end
      if (dto.startTime === dto.endTime) {
        throw new ConflictException('startTime and endTime must differ')
      }
    }

    // Verify staff belongs to property
    const staff = await this.prisma.housekeepingStaff.findFirst({
      where: { id: dto.staffId, propertyId, active: true, deletedAt: null },
      select: { id: true },
    })
    if (!staff) throw new NotFoundException('Staff not found in this property')

    return this.prisma.staffShift.create({
      data: {
        organizationId: orgId,
        propertyId,
        staffId: dto.staffId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
      },
    })
  }

  async updateShift(id: string, dto: UpdateShiftDto) {
    const data: Prisma.StaffShiftUpdateInput = {}
    if (dto.startTime !== undefined) data.startTime = dto.startTime
    if (dto.endTime !== undefined) data.endTime = dto.endTime
    if (dto.active !== undefined) data.active = dto.active
    if (dto.effectiveUntil !== undefined) data.effectiveUntil = new Date(dto.effectiveUntil)

    try {
      return await this.prisma.staffShift.update({ where: { id }, data })
    } catch {
      throw new NotFoundException('Shift not found')
    }
  }

  async deleteShift(id: string) {
    try {
      // Soft delete via active=false; preservamos historial.
      return await this.prisma.staffShift.update({ where: { id }, data: { active: false } })
    } catch {
      throw new NotFoundException('Shift not found')
    }
  }

  // ── Excepciones / Ausencias ──────────────────────────────────────────────

  async listExceptions(propertyId: string, fromDate?: string, toDate?: string) {
    const where: Prisma.StaffShiftExceptionWhereInput = {
      staff: { propertyId },
    }
    if (fromDate || toDate) {
      where.date = {}
      if (fromDate) (where.date as Prisma.DateTimeFilter).gte = new Date(`${fromDate}T00:00:00.000Z`)
      if (toDate) (where.date as Prisma.DateTimeFilter).lte = new Date(`${toDate}T23:59:59.999Z`)
    }
    return this.prisma.staffShiftException.findMany({
      where,
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    })
  }

  async createException(propertyId: string, dto: CreateShiftExceptionDto, approvedById: string) {
    const staff = await this.prisma.housekeepingStaff.findFirst({
      where: { id: dto.staffId, propertyId, active: true, deletedAt: null },
      select: { id: true },
    })
    if (!staff) throw new NotFoundException('Staff not found in this property')

    if (dto.type !== ShiftExceptionType.OFF && (!dto.startTime || !dto.endTime)) {
      throw new ConflictException(`startTime/endTime required for ${dto.type}`)
    }

    try {
      return await this.prisma.staffShiftException.create({
        data: {
          staffId: dto.staffId,
          date: new Date(`${dto.date.split('T')[0]}T00:00:00.000Z`),
          type: dto.type,
          startTime: dto.startTime,
          endTime: dto.endTime,
          reason: dto.reason,
          approvedById,
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An exception already exists for this staff on this date')
      }
      throw err
    }
  }

  /**
   * Atajo de "marcar ausencia" (D5). Crea StaffShiftException(OFF) y devuelve la
   * excepción. El caller (controller del SchedulingModule o el flow del receptionist)
   * después debe llamar a AssignmentService.reassignTasksForAbsence() para mover
   * las tareas de hoy a otros staff disponibles + emitir SSE shift:absence.
   */
  async markAbsence(propertyId: string, dto: CreateAbsenceDto, approvedById: string) {
    return this.createException(
      propertyId,
      {
        staffId: dto.staffId,
        date: dto.date,
        type: ShiftExceptionType.OFF,
        reason: dto.reason ?? 'Marcado como ausente desde recepción',
      },
      approvedById,
    )
  }

  async deleteException(id: string) {
    try {
      return await this.prisma.staffShiftException.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Exception not found')
    }
  }
}
