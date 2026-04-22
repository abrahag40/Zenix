import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../notifications/notifications.module'
import { StayJourneyController } from './stay-journeys.controller'
import { StayJourneyService } from './stay-journeys.service'

@Module({
  imports: [NotificationsModule],
  controllers: [StayJourneyController],
  providers: [StayJourneyService],
  exports: [StayJourneyService],
})
export class StayJourneysModule {}
