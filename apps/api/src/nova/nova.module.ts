/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 3.
 *
 * NovaModule — registra services + guards de la hierarchy 5-tier Nova.
 *
 * Exports:
 *   · AccessControlService — resolve actorTier + assignedOrgIds (DI everywhere)
 *   · NovaActingOrgGuard — global @RequireActingOrg() enforcement
 *
 * Imports:
 *   · PrismaModule (queries 4-tier UNION)
 *
 * Days futuros:
 *   · Day 5+: agregaremos ChannexManagementModule (RoomTypes/RatePlans
 *     controllers) que importa NovaModule para usar el guard.
 *   · Day 9+: ImpersonationService + transparency notifs registrados aquí.
 *   · Day 14+: WizardModule registrado aquí (Wizard Zenix Activate).
 */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AccessControlService } from './access-control/access-control.service'
import { NovaActingOrgGuard } from './guards/nova-acting-org.guard'
import { NovaTiersGuard } from './guards/nova-tiers.guard'

@Module({
  imports: [PrismaModule],
  providers: [AccessControlService, NovaActingOrgGuard, NovaTiersGuard],
  exports: [AccessControlService, NovaActingOrgGuard, NovaTiersGuard],
})
export class NovaModule {}
