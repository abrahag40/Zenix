import { Module } from '@nestjs/common'
import { RoomTypesController } from './room-types.controller'
import { TenantContextService } from '../../common/tenant-context.service'
import { PrecioDeTipoService } from './precio-de-tipo.service'
import { AuditLogService } from '../../nova/audit/audit-log.service'

@Module({
  controllers: [RoomTypesController],
  // `AuditLogService` se registra aquí y no se importa de un módulo: es el
  // mismo patrón que ya usa `BillingModule`, y evita arrastrar el módulo Nova
  // entero —con sus controladores y sus guardias— dentro de éste.
  providers: [TenantContextService, PrecioDeTipoService, AuditLogService],
})
export class RoomTypesModule {}
