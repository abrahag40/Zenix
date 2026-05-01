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

    // Si se está creando como PRIMARY, eliminar cualquier otro PRIMARY de esta room
    // (un room solo puede tener un primary). Manejado idempotentemente.
    const isPrimary = dto.isPrimary ?? true
    if (isPrimary) {
      await this.prisma.staffCoverage.updateMany({
        where: { roomId: dto.roomId, isPrimary: true, staffId: { not: dto.staffId } },
        data: { isPrimary: false },
      })
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
    if (dto.isPrimary === true && !existing.isPrimary) {
      await this.prisma.staffCoverage.updateMany({
        where: { roomId: existing.roomId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      })
    }

    return this.prisma.staffCoverage.update({
      where: { id },
      data: dto,
    })
  }

  async remove(id: string) {
    try {
      return await this.prisma.staffCoverage.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Coverage not found')
    }
  }
}
