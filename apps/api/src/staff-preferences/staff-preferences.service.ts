/**
 * StaffPreferencesService — preferencias del staff con audit log append-only.
 *
 * Reglas de acceso (D9):
 *   - GET /v1/staff/:id/preferences:
 *       - El propio dueño puede leer (actor.sub === staffId)
 *       - SUPERVISOR puede leer cualquier staff de su propiedad
 *   - PATCH /v1/staff/:id/preferences:
 *       - SOLO SUPERVISOR puede escribir gamificationLevel
 *       - El propio dueño puede modificar hapticEnabled / soundEnabled (no implementado en 8H — solo supervisor por simplicidad)
 *   - Cada cambio escribe StaffPreferenceLog (append-only). Trazabilidad completa.
 *
 * find-or-create: si el staff no tiene preferences, se crea on-demand con defaults.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { GamificationLevel, HousekeepingRole } from '@zenix/shared'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateStaffPreferencesDto } from './dto/staff-preferences.dto'

interface ActorContext {
  staffId: string         // actor.sub
  role: HousekeepingRole
  propertyId: string
}

@Injectable()
export class StaffPreferencesService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(staffId: string) {
    let prefs = await this.prisma.staffPreferences.findUnique({ where: { staffId } })
    if (!prefs) {
      const staff = await this.prisma.housekeepingStaff.findUnique({
        where: { id: staffId },
        select: { id: true },
      })
      if (!staff) throw new NotFoundException('Staff not found')
      prefs = await this.prisma.staffPreferences.create({ data: { staffId } })
    }
    return prefs
  }

  async getForStaff(staffId: string, actor: ActorContext) {
    // Authorization: owner OR supervisor in same property
    if (actor.staffId !== staffId && actor.role !== HousekeepingRole.SUPERVISOR) {
      throw new ForbiddenException('Cannot read preferences of another staff member')
    }
    if (actor.role === HousekeepingRole.SUPERVISOR && actor.staffId !== staffId) {
      // Verify staff belongs to supervisor's property
      const target = await this.prisma.housekeepingStaff.findUnique({
        where: { id: staffId },
        select: { propertyId: true },
      })
      if (!target || target.propertyId !== actor.propertyId) {
        throw new ForbiddenException('Staff does not belong to your property')
      }
    }
    return this.findOrCreate(staffId)
  }

  /**
   * Update preferences. Solo supervisor puede modificar gamificationLevel + language (D9).
   * hapticEnabled/soundEnabled pueden ser modificados por el dueño O el supervisor.
   * Cada cambio se loguea en StaffPreferenceLog.
   */
  async update(staffId: string, dto: UpdateStaffPreferencesDto, actor: ActorContext) {
    // Validate target staff exists + belongs to actor's property (if supervisor)
    const target = await this.prisma.housekeepingStaff.findUnique({
      where: { id: staffId },
      select: { id: true, propertyId: true },
    })
    if (!target) throw new NotFoundException('Staff not found')

    const isOwner = actor.staffId === staffId
    const isSupervisor = actor.role === HousekeepingRole.SUPERVISOR

    if (!isOwner && !isSupervisor) {
      throw new ForbiddenException('Cannot update preferences of another staff member')
    }
    if (isSupervisor && target.propertyId !== actor.propertyId) {
      throw new ForbiddenException('Staff does not belong to your property')
    }

    // Solo supervisor puede tocar gamificationLevel y language
    if (
      (dto.gamificationLevel !== undefined || dto.language !== undefined) &&
      !isSupervisor
    ) {
      throw new ForbiddenException(
        'Solo el supervisor puede modificar gamificationLevel/language. Habla con tu supervisor.',
      )
    }

    const current = await this.findOrCreate(staffId)
    const changes: { field: string; oldValue: string | null; newValue: string }[] = []

    const data: Prisma.StaffPreferencesUpdateInput = {}
    if (dto.gamificationLevel !== undefined && dto.gamificationLevel !== current.gamificationLevel) {
      changes.push({
        field: 'gamificationLevel',
        oldValue: current.gamificationLevel,
        newValue: dto.gamificationLevel,
      })
      data.gamificationLevel = dto.gamificationLevel as GamificationLevel
    }
    if (dto.language !== undefined && dto.language !== current.language) {
      changes.push({ field: 'language', oldValue: current.language, newValue: dto.language })
      data.language = dto.language
    }
    if (dto.hapticEnabled !== undefined && dto.hapticEnabled !== current.hapticEnabled) {
      changes.push({
        field: 'hapticEnabled',
        oldValue: String(current.hapticEnabled),
        newValue: String(dto.hapticEnabled),
      })
      data.hapticEnabled = dto.hapticEnabled
    }
    if (dto.soundEnabled !== undefined && dto.soundEnabled !== current.soundEnabled) {
      changes.push({
        field: 'soundEnabled',
        oldValue: String(current.soundEnabled),
        newValue: String(dto.soundEnabled),
      })
      data.soundEnabled = dto.soundEnabled
    }

    if (changes.length === 0) return current

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffPreferences.update({
        where: { staffId },
        data,
      })
      for (const change of changes) {
        await tx.staffPreferenceLog.create({
          data: {
            preferencesId: updated.id,
            staffId,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            changedById: actor.staffId,
            reason: dto.reason,
          },
        })
      }
      return updated
    })
  }

  /** Audit log query — supervisor only. */
  async getLog(staffId: string, actor: ActorContext) {
    if (actor.role !== HousekeepingRole.SUPERVISOR) {
      throw new ForbiddenException('Only supervisors can read preference change logs')
    }
    const target = await this.prisma.housekeepingStaff.findUnique({
      where: { id: staffId },
      select: { propertyId: true },
    })
    if (!target || target.propertyId !== actor.propertyId) {
      throw new ForbiddenException('Staff does not belong to your property')
    }
    return this.prisma.staffPreferenceLog.findMany({
      where: { staffId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }
}
