import { Module } from '@nestjs/common'
import { MaintenanceController } from './maintenance.controller'
import { MaintenanceService } from './maintenance.service'
import { MaintenanceSlaScheduler } from './maintenance-sla.scheduler'
import { NotificationsModule } from '../notifications/notifications.module'
import { NotificationCenterModule } from '../notification-center/notification-center.module'
import { TenantContextService } from '../common/tenant-context.service'

/**
 * Sprint Mx-1 — MaintenanceModule
 *
 * Sistema de tickets (work orders) para gestionar todas las intervenciones
 * técnicas de la propiedad. Cubre 3 flujos:
 *   A) Top-down (supervisor asigna directamente)
 *   B) Bottom-up con aprobación (housekeeper/técnico levanta, supervisor revisa)
 *   C) Cola / pool (sin asignar; voluntary pickup o auto-assignment opcional)
 *
 * D-Mx2: tickets CRITICAL en habitación crean RoomBlock automático en la misma
 * transacción + Channex push (fail-soft vía AvailabilityService.notifyReservation).
 *
 * D-Mx3: VERIFIED libera el bloque + crea CleaningTask post-mantenimiento.
 *
 * Comunicación cross-module según §52: imports vía NotificationCenter, SSE,
 * AvailabilityService (Global). Nunca importa servicios de housekeeping/pms.
 */
@Module({
  imports: [NotificationsModule, NotificationCenterModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceSlaScheduler, TenantContextService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
