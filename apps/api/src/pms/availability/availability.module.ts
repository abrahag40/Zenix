import { Global, Module } from '@nestjs/common'
import { AvailabilityService } from './availability.service'

// Global: every feature that touches inventory (stay-journeys, guest-stays,
// blocks, future channel-manager webhooks) consumes the same instance.
@Global()
@Module({
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
