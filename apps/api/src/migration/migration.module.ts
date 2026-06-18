/**
 * MigrationModule — Zenix Onboard (MIGRATION-CORE). Bounded context (Evans 2003):
 * BD + auth compartidos, sin imports cruzados de otros módulos de dominio.
 * Sprint 1: upload + parse + mapeo a staging. Sprint 2+ agregará validación,
 * detección de empalmes, preview y load idempotente.
 */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { NovaModule } from '../nova/nova.module'
import { AvailabilityModule } from '../pms/availability/availability.module'
import { AuditLogService } from '../nova/audit/audit-log.service'
import { MigrationController } from './migration.controller'
import { MigrationService } from './migration.service'
import { SourcePmsAdapterRegistry } from './adapters/source-pms-adapter.registry'
import { GenericCsvAdapter } from './adapters/generic-csv.adapter'
import { CloudbedsAdapter } from './adapters/cloudbeds.adapter'

@Module({
  // AvailabilityModule → guard anti-overbook en el load (§35). AuditLogService
  // (solo depende de Prisma) se provee local — mismo patrón que wizard.module.
  imports: [PrismaModule, NovaModule, AvailabilityModule],
  controllers: [MigrationController],
  providers: [
    MigrationService,
    SourcePmsAdapterRegistry,
    GenericCsvAdapter,
    CloudbedsAdapter,
    AuditLogService,
  ],
  exports: [MigrationService],
})
export class MigrationModule {}
