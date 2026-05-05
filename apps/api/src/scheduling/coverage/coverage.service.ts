/**
 * CoverageService — gestión de qué habitaciones cubre cada staff por defecto.
 *
 * Una habitación puede tener múltiples coverages: 1 PRIMARY (preferida) + N BACKUPS.
 * El AssignmentService consulta esta tabla para decidir auto-asignación.
 *
 * Política (D5): coverage es SOFT — si la primary no está disponible, el sistema
 * baja a backup; si nadie cubre, round-robin entre on-shift staff.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCoverageDto, UpdateCoverageDto } from './dto/coverage.dto'

@Injectable()
export class CoverageService {
  constructor(private prisma: PrismaService) {}

  async list(propertyId: string) {
    return this.prisma.staffCoverage.findMany({
      where: { propertyId },
      include: {
        staff: { select: { id: true, name: true } },
        room: { select: { id: true, number: true, floor: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { roomId: 'asc' }],
    })
  }

  async listForRoom(roomId: string) {
    return this.prisma.staffCoverage.findMany({
      where: { roomId },
      include: { staff: { select: { id: true, name: true } } },
      orderBy: [{ isPrimary: 'desc' }, { weight: 'desc' }],
    })
  }

  async listForStaff(staffId: string) {
    return this.prisma.staffCoverage.findMany({
      where: { staffId },
      include: { room: { select: { id: true, number: true, floor: true } } },
      orderBy: [{ isPrimary: 'desc' }, { roomId: 'asc' }],
    })
  }

  async create(propertyId: string, dto: CreateCoverageDto) {
    // Verificar que staff y room pertenecen a la propiedad
    const [staff, room] = await Promise.all([
      this.prisma.housekeepingStaff.findFirst({
        where: { id: dto.staffId, propertyId, active: true, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.room.findFirst({
        where: { id: dto.roomId, propertyId },
        select: { id: true },
      }),
    ])
    if (!staff) throw new NotFoundException('Staff not found in this property')
    if (!room) throw new NotFoundException('Room not found in this property')

    // Si se está creando como PRIMARY, demover cualquier otro PRIMARY de esta room.
    // Cuidado con UNIQUE(staffId, roomId, isPrimary): si el staff demovido YA tiene
    // un backup row para esta misma room, hacer DELETE en vez de UPDATE para evitar
    // colisión del constraint.
    const isPrimary = dto.isPrimary ?? true
    if (isPrimary) {
      await this.demoteOtherPrimaries(dto.roomId, /*excludeStaffId*/ dto.staffId, /*excludeId*/ undefined)
    }

    try {
      return await this.prisma.staffCoverage.create({
        data: {
          propertyId,
          staffId: dto.staffId,
          roomId: dto.roomId,
          isPrimary,
          weight: dto.weight ?? 1,
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Coverage already exists for this staff and room')
      }
      throw err
    }
  }

  async update(id: string, dto: UpdateCoverageDto) {
    const existing = await this.prisma.staffCoverage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Coverage not found')

    // Si se está promoviendo a PRIMARY, demover cualquier otro PRIMARY de esa room
    // (con manejo de UNIQUE collision — ver create() arriba).
    if (dto.isPrimary === true && !existing.isPrimary) {
      await this.demoteOtherPrimaries(existing.roomId, /*excludeStaffId*/ undefined, /*excludeId*/ id)
    }

    return this.prisma.staffCoverage.update({
      where: { id },
      data: dto,
    })
  }

  /**
   * Baja a backup todos los PRIMARY rows de una habitación, exceptuando opcionalmente
   * un staff o un coverage row específico.
   *
   * Edge case crítico: el constraint UNIQUE(staffId, roomId, isPrimary) hace que
   * UPDATE primary→backup falle si el staff que se demota YA tiene un row backup
   * para la misma habitación. En ese caso DELETE el primary (el backup pre-existente
   * gana — preserva la intención del usuario sin violar el constraint).
   */
  private async demoteOtherPrimaries(
    roomId: string,
    excludeStaffId?: string,
    excludeId?: string,
  ): Promise<void> {
    const others = await this.prisma.staffCoverage.findMany({
      where: {
        roomId,
        isPrimary: true,
        ...(excludeStaffId ? { staffId: { not: excludeStaffId } } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, staffId: true },
    })
    if (others.length === 0) return

    const staffIds = others.map((o) => o.staffId)
    const conflictingBackups = await this.prisma.staffCoverage.findMany({
      where: { roomId, isPrimary: false, staffId: { in: staffIds } },
      select: { staffId: true },
    })
    const staffWithBackup = new Set(conflictingBackups.map((b) => b.staffId))

    for (const row of others) {
      if (staffWithBackup.has(row.staffId)) {
        await this.prisma.staffCoverage.delete({ where: { id: row.id } })
      } else {
        await this.prisma.staffCoverage.update({
          where: { id: row.id },
          data: { isPrimary: false },
        })
      }
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.staffCoverage.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Coverage not found')
    }
  }
}
