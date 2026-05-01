import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../notifications/notifications.module'
import { AssignmentModule } from '../../assignment/assignment.module'
import { AvailabilityModule } from '../availability/availability.module'
import { StayJourneyController } from './stay-journeys.controller'
import { StayJourneyService } from './stay-journeys.service'

@Module({
  imports: [NotificationsModule, AssignmentModule, AvailabilityModule],
  controllers: [StayJourneyController],
  providers: [StayJourneyService],
  exports: [StayJourneyService],
})
export class StayJourneysModule {}
