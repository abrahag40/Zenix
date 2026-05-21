import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ClsModule, ClsMiddleware } from 'nestjs-cls'
import configuration from './config/configuration'
import { PrismaModule } from './prisma/prisma.module'
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
import { RoomReadinessModule } from './pms/room-readiness/room-readiness.module'
import { RoomTypesModule } from './pms/room-types/room-types.module'
import { StayJourneysModule } from './pms/stay-journeys/stay-journeys.module'
import { RatesModule } from './pms/rates/rates.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { BlocksModule } from './blocks/blocks.module'
import { PaymentsModule } from './payments/payments.module'
import { SoftLockModule } from './soft-lock/soft-lock.module'
import { NotificationCenterModule } from './notification-center/notification-center.module'
// Sprint 8H — Housekeeping scheduling foundation
import { SchedulingModule } from './scheduling/scheduling.module'
import { AssignmentModule } from './assignment/assignment.module'
import { StaffPreferencesModule } from './staff-preferences/staff-preferences.module'
import { FeatureFlagsModule } from './feature-flags/feature-flags.module'
import { UploadsModule } from './uploads/uploads.module'
// DLC Subscription model — genérico para Add-Ons (Learning, Booking, POS, etc.)
import { DLCModule } from './dlc/dlc.module'
// Sprint LEARNING-CORE — Zenix Learning LMS (Add-On/DLC)
import { LearningModule } from './learning/learning.module'
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
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
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
    AvailabilityModule,
    AccessControlModule,
    SettingsModule,
    DiscrepanciesModule,
    ReportsModule,
    DashboardReportsModule, // Sprint 9 — mobile dashboard endpoints
    StaffGamificationModule, // Sprint 8I-J — Hub Recamarista gamificación
    EmailModule,            // stubbed — ver comentario arriba
    GuestStaysModule,
    RoomReadinessModule,
    RoomTypesModule,
    StayJourneysModule,
    RatesModule,
    DashboardModule,
    BlocksModule,
    PaymentsModule,
    SoftLockModule,
    NotificationCenterModule,
    // Sprint 8H — Housekeeping scheduling foundation
    SchedulingModule,
    AssignmentModule,
    StaffPreferencesModule,
    // Server-side feature toggles (testing envs + future feature flags)
    FeatureFlagsModule,
    UploadsModule, // Mx-1B-W2 — image upload + static serve (foundation for Mx-1C)
    // DLC Subscription model — registry de Add-Ons por tenant + DLCGuard
    // (doc en docs/zenix-learning/14-dlc-architecture.md)
    DLCModule,
    // Sprint LEARNING-CORE — Zenix Learning LMS (Add-On/DLC, doc en docs/zenix-learning/)
    LearningModule,
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
