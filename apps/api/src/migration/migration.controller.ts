/**
 * MigrationController — Zenix Onboard (MIGRATION-CORE) Sprint 1.
 *
 * Surface Nova-scoped, RESTful nested bajo Property (igual que ChannexProvision).
 * Auth: NovaTiers PLATFORM / PARTNER_ADMIN / PARTNER_MEMBER / ORG_OWNER +
 * NovaActingOrgGuard. IDOR: toda operación valida que la property/job pertenecen
 * a la acting org (§170 D-NOVA-12).
 *
 *   GET  /v1/nova/migration/sources                         → PMS soportados
 *   POST /v1/nova/properties/:propertyId/migration/jobs     → crear + subir + parsear
 *   GET  /v1/nova/properties/:propertyId/migration/jobs     → listar jobs
 *   GET  /v1/nova/migration/jobs/:jobId                      → detalle del job
 *   POST /v1/nova/migration/jobs/:jobId/mapping             → aplicar mapeo (genérico)
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Request } from 'express'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NovaTiers, NovaTiersGuard } from '../nova/guards/nova-tiers.guard'
import { NovaActingOrgGuard, RequireActingOrg } from '../nova/guards/nova-acting-org.guard'
import { MigrationService } from './migration.service'
import { CreateMigrationJobDto, ApplyMappingDto } from './dto/migration-dto'

function resolveActingOrgId(req: Request & { user?: JwtPayload }): string | undefined {
  const augmented = req as Request & { actingOrgId?: string; user?: JwtPayload }
  return augmented.actingOrgId ?? augmented.user?.organizationId
}

@Controller('v1/nova')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
export class MigrationController {
  constructor(
    private readonly migration: MigrationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('migration/sources')
  listSources() {
    return this.migration.listSources()
  }

  @Post('properties/:propertyId/migration/jobs')
  @RequireActingOrg()
  async createJob(
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateMigrationJobDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const orgId = this.requireOrg(req)
    await this.assertPropertyInOrg(propertyId, orgId)
    const uploadedById = (req.user?.sub as string) ?? 'unknown'
    return this.migration.createJob(orgId, propertyId, uploadedById, {
      sourceSystem: dto.sourceSystem,
      fileName: dto.fileName,
      fileBase64: dto.fileBase64,
      mapping: dto.mapping,
    })
  }

  @Get('properties/:propertyId/migration/jobs')
  @RequireActingOrg()
  async listJobs(
    @Param('propertyId') propertyId: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const orgId = this.requireOrg(req)
    await this.assertPropertyInOrg(propertyId, orgId)
    return this.migration.listJobs(propertyId)
  }

  @Get('migration/jobs/:jobId')
  @RequireActingOrg()
  async getJob(@Param('jobId') jobId: string, @Req() req: Request & { user?: JwtPayload }) {
    const orgId = this.requireOrg(req)
    await this.migration.assertJobInOrg(jobId, orgId)
    return this.migration.getJob(jobId)
  }

  @Get('migration/jobs/:jobId/conflicts')
  @RequireActingOrg()
  async getConflicts(@Param('jobId') jobId: string, @Req() req: Request & { user?: JwtPayload }) {
    const orgId = this.requireOrg(req)
    await this.migration.assertJobInOrg(jobId, orgId)
    return this.migration.getConflicts(jobId)
  }

  @Post('migration/jobs/:jobId/mapping')
  @RequireActingOrg()
  async applyMapping(
    @Param('jobId') jobId: string,
    @Body() dto: ApplyMappingDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const orgId = this.requireOrg(req)
    await this.migration.assertJobInOrg(jobId, orgId)
    return this.migration.applyMapping(jobId, dto.mapping)
  }

  // ─── helpers ──────────────────────────────────────────────────────────────
  private requireOrg(req: Request & { user?: JwtPayload }): string {
    const orgId = resolveActingOrgId(req)
    if (!orgId) {
      throw new BadRequestException(
        'Sin acting org — PLATFORM debe enviar X-Acting-Organization-Id para esta operación.',
      )
    }
    return orgId
  }

  private async assertPropertyInOrg(propertyId: string, orgId: string) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { organizationId: true },
    })
    if (!prop) throw new ForbiddenException(`Property ${propertyId} no encontrada`)
    if (prop.organizationId !== orgId) {
      throw new ForbiddenException(`Property ${propertyId} no pertenece a la organización en contexto`)
    }
  }
}
