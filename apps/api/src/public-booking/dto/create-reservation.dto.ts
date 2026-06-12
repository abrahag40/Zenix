import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator'

/**
 * Datos del titular de la reserva (común a todas las habitaciones del array).
 */
export class ReservationGuestDto {
  @IsString()
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string
}

/**
 * Una línea de habitación de la reserva. El website la arma a partir de los
 * `roomTypeId` que obtuvo de GET /room-types + /availability (B1).
 *
 * MODELO (responde la duda del owner): el cliente reserva un **tipo de
 * habitación** (no una habitación física concreta) en un rango de fechas, con su
 * propia cantidad de huéspedes. Zenix asigna la habitación física libre del tipo
 * (estándar de industria; mismo path que Channex inbound §137). Cada línea puede
 * tener un `roomTypeId` y fechas DISTINTAS → la API soporta nativamente "villa
 * noches 1-3 + suite noches 4-5" o "2 habitaciones para una familia".
 */
export class ReservationRoomDto {
  @IsString()
  roomTypeId!: string

  @IsISO8601()
  checkIn!: string

  @IsISO8601()
  checkOut!: string

  @IsInt()
  @Min(1)
  adults!: number

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number

  /** Nombre del ocupante de esta habitación (grupos). Opcional. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string
}

export class CreateReservationDto {
  @ValidateNested()
  @Type(() => ReservationGuestDto)
  guest!: ReservationGuestDto

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20) // límite anti-abuso; grupos > 20 → contactar al hotel
  @ValidateNested({ each: true })
  @Type(() => ReservationRoomDto)
  rooms!: ReservationRoomDto[]

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}
