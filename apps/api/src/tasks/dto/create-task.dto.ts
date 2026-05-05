import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { Capability, Priority, TaskType } from '@zenix/shared'

/**
 * EndTaskDto — snapshot opcional del checklist al finalizar.
 * Se persiste en TaskLog.metadata para queries de reportes.
 */
export class ChecklistItemSnapshotDto {
  @IsString()
  id: string

  @IsString()
  label: string

  @IsBoolean()
  completed: boolean
}

export class EndTaskDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemSnapshotDto)
  checklist?: ChecklistItemSnapshotDto[]
}

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
