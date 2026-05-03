import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, Matches } from 'class-validator'

export class UpsertFlagDto {
  /**
   * Naming convention obligatoria — `<scope>.<name>`:
   *   test.*    | feature.* | debug.*
   * Esto facilita filtros y previene flags sin contexto.
   */
  @IsString()
  @Matches(/^(test|feature|debug)\.[a-z0-9_]+$/, {
    message: 'key debe ser <test|feature|debug>.<nombre_snake_case>',
  })
  @MaxLength(60)
  key: string

  @IsBoolean()
  enabled: boolean

  @IsOptional()
  @IsUUID()
  propertyId?: string

  /** Configuración libre. Validada por flag-específico en el service. */
  @IsOptional()
  config?: Record<string, unknown>

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string
}
