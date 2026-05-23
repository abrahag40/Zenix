import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { NotificationCenterModule } from '../notification-center/notification-center.module'
import { TenantContextService } from '../common/tenant-context.service'

import { CatalogController } from './catalog/catalog.controller'
import { CatalogService } from './catalog/catalog.service'
import { EnrollmentsController } from './enrollments/enrollments.controller'
import { EnrollmentsService } from './enrollments/enrollments.service'
import { LessonsController } from './lessons/lessons.controller'
import { LessonsService } from './lessons/lessons.service'
import { AttemptsController } from './attempts/attempts.controller'
import { AttemptsService } from './attempts/attempts.service'
import { CertificatesController } from './certificates/certificates.controller'
import { CertificatesService } from './certificates/certificates.service'
import { LearningScopeService } from './scope/learning-scope.service'
import { LearningReminderScheduler } from './schedulers/learning-reminder.scheduler'

/**
 * Sprint LEARNING-CORE — Zenix Learning (LMS Add-On/DLC)
 *
 * Módulo de capacitación embebido al PMS. Add-On/DLC pago, con curso-regalo
 * como hook comercial. Justificación legal LFT México Art. 153-A a 153-X.
 *
 * Decisiones de diseño (doc completo: docs/zenix-learning/):
 *   - Multi-tenant 4-level (§63-§72 paridad) — organizationId denormalizado +
 *     legalEntityId para reporting STPS.
 *   - Append-only audit (§14, §28 paridad) — LearningEnrollmentLog y
 *     LearningAttempt sin @updatedAt.
 *   - Service-layer authorization (§35 paridad) — TenantContextService valida
 *     antes de mutaciones.
 *   - 3 niveles curriculares: Course → Module → Lesson (no replicar el
 *     árbol Curricula/Item/Class/Program/Task de SuccessFactors).
 *   - Strategy pattern fiscal (§89 paridad): ILearningComplianceAdapter por
 *     país — MxStpsAdapter es BASE Fase 1.
 *
 * Fase 1 (este sprint): solo formato nativo Zenix (HTML5/audio/video/PDF).
 * Fase 2 (v1.1.x): SCORM 1.2/2004 + xAPI + cmi5.
 *
 * Comunicación cross-module según §Bounded contexts: vía NotificationCenter +
 * SSE singleton. NO importa servicios de housekeeping/maintenance/pms.
 */
@Module({
  imports: [NotificationsModule, NotificationCenterModule],
  controllers: [
    CatalogController,
    EnrollmentsController,
    LessonsController,
    AttemptsController,
    CertificatesController,
  ],
  providers: [
    CatalogService,
    EnrollmentsService,
    LessonsService,
    AttemptsService,
    CertificatesService,
    // §multi-tenant — single source of truth para auth Learning-específica.
    // Inyecta AccessControlService (@Global) y resuelve scope BRAND/
    // LEGAL_ENTITY/PROPERTY antes de mutaciones cross-property.
    LearningScopeService,
    // Sprint LEARNING-CORE Fase 1.2 Día 7 — push reminders cron 9 AM Mx
    LearningReminderScheduler,
    TenantContextService,
  ],
  exports: [
    CatalogService,
    EnrollmentsService,
    CertificatesService,
    LearningScopeService,
  ],
})
export class LearningModule {}
