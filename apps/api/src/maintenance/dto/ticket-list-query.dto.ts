import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator'
import { TicketCategory, TicketPriority, TicketStatus } from '@zenix/shared'

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined

export class TicketListQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  status?: TicketStatus | TicketStatus[]

  @IsOptional()
  @IsEnum(TicketPriority, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  priority?: TicketPriority | TicketPriority[]

  @IsOptional()
  @IsEnum(TicketCategory, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  category?: TicketCategory | TicketCategory[]

  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsUUID()
  roomId?: string

  @IsOptional()
  @IsString()
  assetTag?: string

  @IsOptional()
  @IsDateString()
  fromDate?: string

  @IsOptional()
  @IsDateString()
  toDate?: string

  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  queueOnly?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  pendingApprovalOnly?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(toBool)
  activeOnly?: boolean
}
