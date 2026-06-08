import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ClsModule, ClsMiddleware } from 'nestjs-cls'
import configuration from './config/configuration'
import { PrismaModule } from './prisma/prisma.module'
import { AuditModule } from './common/audit/audit.module'
import { AuthModule } from './auth/auth.module'
import { PropertiesModule } from './properties/properties.module'
import { RoomsModule } from './rooms/rooms.module'
import { UnitsModule } from './units/units.module'
import { StaffModule } from './staff/staff.module'
import { TasksModule } from './tasks/tasks.module'
import { CheckoutsModule } from './checkouts/checkouts.module'
import { NotesModule } from './notes/notes.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ChannexModule } from './integrations/channex/channex.module'
import { ChannexInboundModule } from './integrations/channex/inbound/channex-inbound.module'
import { ChannexOutboundModule } from './integrations/channex/outbound/channex-outbound.module'
import { ChannexManagementModule } from './nova/channex-management/channex-management.module'
import { WizardModule } from './nova/wizard/wizard.module'
import { AvailabilityModule } from './pms/availability/availability.module'
import { AccessControlModule } from './common/access-control/access-control.module'
import { SettingsModule } from './settings/settings.module'
import { DiscrepanciesModule } from './discrepancies/discrepancies.module'
import { ReportsModule } from './reports/reports.module'
import { DashboardReportsModule } from './dashboard-reports/dashboard-reports.module'
import { StaffGamificationModule } from './staff-gamification/staff-gamification.module'
// EmailModule fue stubbed temporalmente (sin @nestjs-modules/mailer). Sigue
// activo y expone EmailService con envío no-op hasta que se configure SMTP.
import { EmailModule } from './common/email/email.module'
import { GuestStaysModule } from './pms/guest-stays/guest-stays.module'
import { CancellationPolicyModule } from './pms/cancellation/cancellation-policy.module'
import { RoomReadinessModule } from './pms/room-readiness/room-readiness.module'
import { RoomTypesModule } from './pms/room-types/room-types.module'
import { StayJourneysModule } from './pms/stay-journeys/stay-journeys.module'
import { RatesModule } from './pms/rates/rates.module'
import { MetricsModule } from './pms/metrics/metrics.module'
import { CompsetModule } from './pms/compset/compset.module'
import { LocalEventsModule } from './pms/local-events/local-events.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { FeedModule } from './dashboard/feed/feed.module'
import { BlocksModule } from './blocks/blocks.module'
// PaymentsModule eliminado 2026-05-29 — no-show charging via Stripe estaba
// fuera del scope productivo (Stripe solo se usa para SaaS subscription
// Zenix + Booking Engine futuro). El campo GuestStay.noShowChargeStatus
// queda como tracking interno del PMS (cobro manual en efectivo/checkout).
import { SoftLockModule } from './soft-lock/soft-lock.module'
import { NotificationCenterModule } from './notification-center/notification-center.module'
// Sprint 8H — Housekeeping scheduling foundation
import { SchedulingModule } from './scheduling/scheduling.module'
import { AssignmentModule } from './assignment/assignment.module'
import { StaffPreferencesModule } from './staff-preferences/staff-preferences.module'
import { FeatureFlagsModule } from './feature-flags/feature-flags.module'
import { UploadsModule } from './uploads/uploads.module'
import { BillingModule } from './billing/billing.module'
import { TenantContextMiddleware } from './common/tenant-context.middleware'
import { TenantContextService } from './common/tenant-context.service'
import { TenantGuard } from './common/guards/tenant.guard'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { PropertyScopeGuard } from './common/guards/property-scope.guard'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: false },
    }),
    // Sprint AUDIT-CORE — wildcard support para que AuditOutboxListener
    // matchee `audit.**` con un solo @OnEvent en vez de 14. Performance
    // negligible (set-based lookup vs literal map) y permite naming
    // convention consistente.
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule, // Sprint AUDIT-CORE — global, expone AuditOutboxService
    AuthModule,
    PropertiesModule,
    RoomsModule,
    UnitsModule,
    StaffModule,
    TasksModule,
    CheckoutsModule,
    NotesModule,
    MaintenanceModule,
    NotificationsModule,
    ChannexModule,
    ChannexInboundModule, // Sprint CHANNEX-INBOUND — webhooks OTA → PMS
    ChannexOutboundModule, // Sprint CHANNEX-OUTBOUND-CERT — PMS → Channex ARI push
    ChannexManagementModule, // Sprint NOVA-CHANNEX-COMMAND-CENTER Day 5 — Channex CRUD endpoints
    WizardModule, // Sprint NOVA-CHANNEX-COMMAND-CENTER Day 16 — Wizard Zenix Activate (health-checks + activate)
    AvailabilityModule,
    AccessControlModule,
    SettingsModule,
    DiscrepanciesModule,
    ReportsModule,
    DashboardReportsModule, // Sprint 9 — mobile dashboard endpoints
    StaffGamificationModule, // Sprint 8I-J — Hub Recamarista gamificación
    EmailModule,            // stubbed — ver comentario arriba
    GuestStaysModule,
    CancellationPolicyModule,
    RoomReadinessModule,
    RoomTypesModule,
    StayJourneysModule,
    RatesModule,
    MetricsModule,
    CompsetModule,
    LocalEventsModule,
    DashboardModule,
    FeedModule,
    BlocksModule,
    SoftLockModule,
    NotificationCenterModule,
    // Sprint 8H — Housekeeping scheduling foundation
    SchedulingModule,
    AssignmentModule,
    StaffPreferencesModule,
    // Server-side feature toggles (testing envs + future feature flags)
    FeatureFlagsModule,
    UploadsModule, // Mx-1B-W2 — image upload + static serve (foundation for Mx-1C)
    BillingModule, // Sprint BILLING-CORE (v1.1.0) — Stripe subscription billing + discount codes + retention + dunning
  ],
  providers: [
    TenantContextService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      // Sprint SEC-α — bug MT-5 — blocks IDOR via ?propertyId= query param.
      provide: APP_GUARD,
      useClass: PropertyScopeGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ClsMiddleware, TenantContextMiddleware).forRoutes('*')
  }
}
