import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto'

/**
 * CRUD de reportes programados (P4a). Scope estricto a la propiedad del actor
 * (SUPERVISOR). El envío lo dispara ScheduledReportsScheduler.
 */
@Injectable()
export class ScheduledReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: JwtPayload) {
    return this.prisma.scheduledReport.findMany({
      where: { propertyId: actor.propertyId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(actor: JwtPayload, dto: CreateScheduledReportDto) {
    return this.prisma.scheduledReport.create({
      data: {
        propertyId: actor.propertyId,
        organizationId: actor.organizationId,
        reportKey: dto.reportKey,
        frequency: dto.frequency,
        sendHour: dto.sendHour,
        weekday: dto.frequency === 'WEEKLY' ? dto.weekday ?? 1 : null,
        monthday: dto.frequency === 'MONTHLY' ? dto.monthday ?? 1 : null,
        rangeDays: dto.rangeDays,
        recipients: dto.recipients,
        format: dto.format ?? 'xlsx',
        filters: (dto.filters ?? undefined) as object | undefined,
        createdById: actor.sub,
      },
    })
  }

  async update(actor: JwtPayload, id: string, dto: UpdateScheduledReportDto) {
    await this.assertOwned(actor, id)
    const freq = dto.frequency
    return this.prisma.scheduledReport.update({
      where: { id },
      data: {
        frequency: dto.frequency,
        sendHour: dto.sendHour,
        // Limpia weekday/monthday si cambia la frecuencia a una que no los usa.
        weekday: freq ? (freq === 'WEEKLY' ? dto.weekday ?? 1 : null) : dto.weekday,
        monthday: freq ? (freq === 'MONTHLY' ? dto.monthday ?? 1 : null) : dto.monthday,
        rangeDays: dto.rangeDays,
        recipients: dto.recipients,
        format: dto.format,
        active: dto.active,
        filters:
          dto.filters === undefined
            ? undefined
            : dto.filters === null
              ? Prisma.DbNull
              : (dto.filters as Prisma.InputJsonValue),
      },
    })
  }

  async remove(actor: JwtPayload, id: string) {
    await this.assertOwned(actor, id)
    await this.prisma.scheduledReport.delete({ where: { id } })
    return { deleted: true }
  }

  private async assertOwned(actor: JwtPayload, id: string) {
    const row = await this.prisma.scheduledReport.findUnique({ where: { id }, select: { propertyId: true } })
    if (!row || row.propertyId !== actor.propertyId) {
      throw new NotFoundException('Reporte programado no encontrado en esta propiedad.')
    }
  }
}
