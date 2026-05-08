import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { Capability, StaffRole } from '@zenix/shared'

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name: string

  @IsEmail()
  email: string

  @IsString()
  @MinLength(6)
  password: string

  @IsEnum(StaffRole)
  role: StaffRole

  @IsOptional()
  @IsArray()
  @IsEnum(Capability, { each: true })
  capabilities?: Capability[]
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  /** Actualizar email — debe ser único globalmente. */
  @IsOptional()
  @IsEmail()
  email?: string

  /**
   * Nueva contraseña. Si se omite, la contraseña actual NO se modifica.
   * El servicio la hashea con bcrypt antes de persistirla.
   */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsArray()
  @IsEnum(Capability, { each: true })
  capabilities?: Capability[]

  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole
}
