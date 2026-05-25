/**
 * WizardModule — Sprint NOVA-CHANNEX-COMMAND-CENTER Day 16.
 *
 * Surface: /v1/nova/wizard/* (controlled por NovaTiers PLATFORM/PARTNER_*).
 *
 * Cierra el bucle del Wizard Zenix Activate:
 *   · Health checks (Channex real + Stripe/PAC/SMTP stubs Day 17)
 *   · Activación transaccional (Org + Brand + LegalEntity + Properties + Owner)
 *   · AuditLog ORGANIZATION_ACTIVATED append-only
 *
 * Deps:
 *   · PrismaModule (queries multi-tenant)
 *   · ChannexModule (Channex gateway para health/channex real)
 *   · NovaModule.AuditLogService — re-imported via channex-management.module
 *     porque AuditLogService está exportado allí (será movido a nova/audit
 *     standalone en refactor v1.0.5).
 */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ChannexModule } from '../../integrations/channex/channex.module'
import { NovaModule } from '../nova.module'
import { AuditLogService } from '../audit/audit-log.service'
import { WizardController } from './wizard.controller'
import { WizardHealthService } from './wizard-health.service'
import { WizardActivationService } from './wizard-activation.service'

@Module({
  imports: [PrismaModule, ChannexModule, NovaModule],
  controllers: [WizardController],
  providers: [WizardHealthService, WizardActivationService, AuditLogService],
  exports: [WizardActivationService],
})
export class WizardModule {}
