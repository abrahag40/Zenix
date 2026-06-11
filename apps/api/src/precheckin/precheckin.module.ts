import { Module } from '@nestjs/common'
import { UploadsModule } from '../uploads/uploads.module'
import { PrecheckinService } from './precheckin.service'
import { PrecheckinController } from './precheckin.controller'

/**
 * Sprint AUTO-CHECKIN (2026-06-11) — pre-arrival identity capture.
 * PrismaModule es @Global; EventEmitterModule.forRoot() también. Importamos
 * UploadsModule por la foto de ID (scope `precheckin`).
 * El email scheduler/service (Fase 1b) se agrega aquí cuando se implemente.
 */
@Module({
  imports: [UploadsModule],
  controllers: [PrecheckinController],
  providers: [PrecheckinService],
  exports: [PrecheckinService],
})
export class PrecheckinModule {}
