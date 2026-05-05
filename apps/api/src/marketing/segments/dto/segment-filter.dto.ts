/**
 * SegmentFilterDto — parámetros de entrada para todos los segmentos de marketing.
 *
 * PSEUDOCODE — implementar en Sprint 9+
 *
 * Un "segmento" es un subconjunto filtrado de huéspedes con criterios compartidos.
 * El output de cada segmento es una lista de ContactRecord listos para exportar
 * al CRM externo del operador.
 */

// PSEUDOCODE:
//
// import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator'
//
// export class SegmentFilterDto {
//   @IsString()
//   propertyId: string
//
//   // Rango de fechas para filtrar eventos (extensiones, no-shows, check-ins)
//   @IsOptional() @IsDateString()
//   from?: string   // YYYY-MM-DD, default: últimos 30 días
//
//   @IsOptional() @IsDateString()
//   to?: string     // YYYY-MM-DD, default: hoy
//
//   // Para segmento de alto valor
//   @IsOptional() @IsNumber()
//   minRevenue?: number   // threshold de totalAmount en moneda de la propiedad
//
//   // Para segmento de huéspedes frecuentes
//   @IsOptional() @IsNumber()
//   minStays?: number     // número mínimo de estadías (default: 2)
//
//   // Filtro adicional por canal OTA
//   @IsOptional() @IsString()
//   source?: string   // 'BOOKING', 'AIRBNB', 'DIRECT', etc.
//
//   // Filtro por nacionalidad (para campañas segmentadas por mercado emisor)
//   @IsOptional() @IsString()
//   nationality?: string   // ISO 3166-1 alpha-2, e.g. 'MX', 'US', 'CO'
// }
//
// export interface ContactRecord {
//   guestName: string
//   guestEmail?: string
//   guestPhone?: string
//   nationality?: string
//   source: string        // canal OTA de la reserva original
//   lastCheckIn: Date
//   lastCheckOut: Date
//   totalStays: number
//   totalRevenue: number
//   currency: string
//   segmentTags: string[] // ['extended', 'repeat', 'high-value', 'no-show']
// }

export {}
