import { Module } from '@nestjs/common'
import { RoomTypesController } from './room-types.controller'
import { TenantContextService } from '../../common/tenant-context.service'
import { PrecioDeTipoService } from './precio-de-tipo.service'

@Module({
  controllers: [RoomTypesController],
  providers: [TenantContextService, PrecioDeTipoService],
})
export class RoomTypesModule {}
