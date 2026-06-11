import { Module } from '@nestjs/common'
import { UploadsModule } from '../uploads/uploads.module'
import { PrecheckinService } from './precheckin.service'
import { PrecheckinController } from './precheckin.controller'
import { PrecheckinEmailService } from './precheckin-email.service'
import { PrecheckinScheduler } from './precheckin.scheduler'

/**
 * Sprint AUTO-CHECKIN (2026-06-11) — pre-arrival identity capture.
 * PrismaModule es @Global; EventEmitterModule.forRoot() también. Importamos
 * UploadsModule por la foto de ID (scope `precheckin`).
 * El email scheduler/service (Fase 1b) se agrega aquí cuando se implemente.
 */
@Module({
  imports: [UploadsModule],
  controllers: [PrecheckinController],
  providers: [PrecheckinService, PrecheckinEmailService, PrecheckinScheduler],
  exports: [PrecheckinService],
})
export class PrecheckinModule {}
