import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { MigrationSource } from '@zenix/shared'

const SOURCE_VALUES = Object.values(MigrationSource)

export class CreateMigrationJobDto {
  @IsIn(SOURCE_VALUES, { message: `sourceSystem debe ser uno de: ${SOURCE_VALUES.join(', ')}` })
  sourceSystem!: string

  @IsString() @MinLength(1) @MaxLength(200)
  fileName!: string

  /** Contenido del archivo CSV en base64 (data-URI sin prefijo o base64 puro). */
  @IsString() @MinLength(1)
  fileBase64!: string

  /**
   * Mapeo de columnas (solo para origen GENERIC_CSV; los adapters dedicados
   * traen su pre-mapeo). { reservation: { campoCanónico: header }, dateFormat? }.
   */
  @IsOptional()
  @IsObject()
  mapping?: { reservation: Record<string, string>; dateFormat?: string }
}

export class ApplyMappingDto {
  @IsObject()
  mapping!: { reservation: Record<string, string>; dateFormat?: string }
}
