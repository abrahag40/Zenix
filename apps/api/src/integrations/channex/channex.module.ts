import { Global, Module } from '@nestjs/common'
import { ChannexGateway } from './channex.gateway'

// Global so any feature module can inject ChannexGateway without re-importing.
@Global()
@Module({
  providers: [ChannexGateway],
  exports: [ChannexGateway],
})
export class ChannexModule {}
