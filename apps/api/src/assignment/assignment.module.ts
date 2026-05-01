import { Module, forwardRef } from '@nestjs/common'
import { AssignmentService } from './assignment.service'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { NotificationsModule } from '../notifications/notifications.module'

/**
 * AssignmentModule — auto-asignación de tareas (D10).
 *
 * Importa SchedulingModule (AvailabilityQueryService) y NotificationsModule
 * (SSE para informar al supervisor en tiempo real). NO importa CheckoutsModule
 * ni GuestStaysModule para evitar dependencias circulares — esos módulos
 * importan AssignmentModule, no al revés.
 *
 * forwardRef sobre SchedulingModule: SchedulingController consume
 * AssignmentService (ausencias, run-roster), creando un ciclo Scheduling↔Assignment.
 */
@Module({
  imports: [forwardRef(() => SchedulingModule), NotificationsModule],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
