import { Module } from '@nestjs/common'
import { StaffPreferencesController } from './staff-preferences.controller'
import { StaffPreferencesService } from './staff-preferences.service'

@Module({
  controllers: [StaffPreferencesController],
  providers: [StaffPreferencesService],
  exports: [StaffPreferencesService],
})
export class StaffPreferencesModule {}
