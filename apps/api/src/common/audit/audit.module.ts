/**
 * AuditModule — registra service + listener + re-exporta service.
 *
 * Global module porque múltiples feature modules necesitan inyectar
 * AuditOutboxService (GuestStaysModule, PaymentsModule, etc.).
 */
import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AuditOutboxService } from './audit-outbox.service'
import { AuditOutboxListener } from './audit-outbox.listener'

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditOutboxService, AuditOutboxListener],
  exports: [AuditOutboxService],
})
export class AuditModule {}
