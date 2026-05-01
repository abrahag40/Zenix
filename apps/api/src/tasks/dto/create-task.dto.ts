import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'
import { Capability, Priority, TaskType } from '@zenix/shared'

export class CreateTaskDto {
  @IsUUID()
  unitId: string

  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType

  @IsOptional()
  @IsEnum(Capability)
  requiredCapability?: Capability

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority
}

export class AssignTaskDto {
  @IsUUID()
  assignedToId: string
}

export class QueryTaskDto {
  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsUUID()
  unitId?: string

  @IsOptional()
  @IsUUID()
  roomId?: string

  /** Filtra tareas con scheduledFor=YYYY-MM-DD (Sprint 8H — mobile roster del día). */
  @IsOptional()
  @IsString()
  scheduledFor?: string
}
