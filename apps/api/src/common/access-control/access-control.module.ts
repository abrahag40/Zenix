import { Global, Module } from '@nestjs/common'
import { AccessControlService } from './access-control.service'

// Global: cualquier feature module (reports cross-property, partner portal,
// future Zenix Activate wizard) puede inyectar AccessControlService sin
// importar el module explícitamente. Pattern idéntico a AvailabilityModule.
@Global()
@Module({
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
