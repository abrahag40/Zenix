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
import { AuthModule } from '../../auth/auth.module'
import { NovaModule } from '../nova.module'
import { AuditLogService } from '../audit/audit-log.service'
import { WizardController } from './wizard.controller'
import { WizardHealthService } from './wizard-health.service'
import { WizardActivationService } from './wizard-activation.service'
import { ActivationEmailService } from './activation-email.service'
import { SetupController } from './setup.controller'
import { SetupService } from './setup.service'

@Module({
  // AuthModule provee JwtModule (re-exported) para que SetupService firme
  // JWTs post-activación y haga auto-login del Org Owner.
  imports: [PrismaModule, ChannexModule, AuthModule, NovaModule],
  controllers: [WizardController, SetupController],
  providers: [
    WizardHealthService,
    WizardActivationService,
    ActivationEmailService, // Day 18 — Resend wiring + welcome email
    SetupService,
    AuditLogService,
  ],
  exports: [WizardActivationService, SetupService, ActivationEmailService],
})
export class WizardModule {}
