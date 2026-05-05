import { Module } from '@nestjs/common'
import { StaffGamificationController } from './staff-gamification.controller'
import { StaffGamificationService } from './staff-gamification.service'
import { StreakScheduler } from './streak.scheduler'

@Module({
  controllers: [StaffGamificationController],
  providers: [StaffGamificationService, StreakScheduler],
  // Exported so TasksService can call onTaskCompleted/onTaskVerified.
  exports: [StaffGamificationService],
})
export class StaffGamificationModule {}
