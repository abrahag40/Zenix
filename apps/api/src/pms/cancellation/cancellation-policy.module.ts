import { Module } from '@nestjs/common'
import { CancellationPolicyController } from './cancellation-policy.controller'
import { CancellationPolicyService } from './cancellation-policy.service'
import { TenantContextService } from '../../common/tenant-context.service'

/**
 * GROUP-BILLING Fase C — módulo de políticas de cancelación. PrismaService es
 * global; TenantContextService se provee local (mismo patrón que GuestStaysModule).
 */
@Module({
  controllers: [CancellationPolicyController],
  providers: [CancellationPolicyService, TenantContextService],
  exports: [CancellationPolicyService],
})
export class CancellationPolicyModule {}
