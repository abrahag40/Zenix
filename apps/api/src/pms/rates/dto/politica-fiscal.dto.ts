import { Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min,
} from 'class-validator'

/**
 * DTOs del control de publicación fiscal.
 *
 * `importeCentavos` es un ENTERO de centavos, nunca un decimal: el cálculo
 * fiscal entero es lo que garantiza que `neto + impuestos === total` al
 * centavo. Aceptar un float aquí reintroduciría por la puerta de atrás el
 * error de redondeo que ya nos costó un 31 % de totales descuadrados.
 */
export class VistaPreviaFiscalDto {
  // 🔴 NO es UUID. Los ids de property en Zenix son legibles
  // (`prop-hotel-tulum-001`). Validarlos como UUID hacía fallar la pantalla
  // entera con 400 — y ni `tsc` ni las pruebas unitarias lo veían, porque
  // ninguna de las dos ejecuta el `ValidationPipe`.
  @IsString({ message: 'propertyId requerido' })
  propertyId!: string

  /**
   * Los importes de TODOS los tipos de habitación en una sola petición.
   * Antes era uno por llamada: cinco tipos = cinco `findUnique` idénticos
   * sobre la misma propiedad. El lote resuelve la jurisdicción UNA vez.
   *
   * Centavos enteros. 100 000 000 = un millón de pesos: techo de cordura.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100_000_000, { each: true })
  importesCentavos!: number[]

  @IsOptional() @IsBoolean()
  tarifaIncluyeImpuestos?: boolean

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true })
  regimenes?: string[]

  @IsOptional() @IsString()
  municipio?: string | null

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  ocupantes?: number
}

export class GuardarPoliticaFiscalDto {
  @IsString({ message: 'propertyId requerido' })
  propertyId!: string

  @IsOptional() @IsBoolean()
  tarifaIncluyeImpuestos?: boolean

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true })
  regimenes?: string[]

  @IsOptional() @IsString()
  municipio?: string | null

  @IsOptional() @IsIn(['HOTEL', 'PRIVATE_RENTAL'])
  tipoDeEstablecimiento?: 'HOTEL' | 'PRIVATE_RENTAL'
}
