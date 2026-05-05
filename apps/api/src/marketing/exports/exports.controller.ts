/**
 * ExportsController — endpoints de export de segmentos de marketing.
 *
 * PSEUDOCODE — implementar en Sprint 9+
 *
 * Todos los endpoints son GET (read-only, sin side effects).
 * El output es un archivo descargable (CSV) o JSON para integraciones API.
 *
 * Autenticación: JwtAuthGuard (igual que el resto del PMS).
 * Roles permitidos: SUPERVISOR, MANAGER, ADMIN (no HOUSEKEEPER, no RECEPTIONIST
 * de primer nivel — datos de contacto son sensibles).
 *
 * Rate limiting: los exports de segmentos pueden ser costosos en DB.
 * Considerar: ThrottlerGuard (NestJS) o caché de 5 min para el mismo filtro.
 */

// PSEUDOCODE:
//
// import { Controller, Get, Query, Res, UseGuards, Header } from '@nestjs/common'
// import { Response } from 'express'
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
// import { Roles } from '../../common/decorators/roles.decorator'
// import { HousekeepingRole } from '@zenix/shared'
// import { SegmentsService } from '../segments/segments.service'
// import { ExportsService } from './exports.service'
//
// @UseGuards(JwtAuthGuard)
// @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.MANAGER)
// @Controller('v1/marketing/exports')
// export class ExportsController {
//   constructor(
//     private segments: SegmentsService,
//     private exports: ExportsService,
//   ) {}
//
//   // GET /v1/marketing/exports/extensions?propertyId=X&from=Y&to=Z&format=csv|json
//   @Get('extensions')
//   async exportExtensions(
//     @Query('propertyId') propertyId: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//     @Query('format') format: 'csv' | 'json' = 'csv',
//     @Res() res?: Response,
//   ) {
//     const records = await this.segments.getExtensionSegment({ propertyId, from, to })
//     return this.respondWithExport(res!, records, 'extensiones', format)
//   }
//
//   // GET /v1/marketing/exports/no-shows?propertyId=X&from=Y&to=Z
//   @Get('no-shows')
//   async exportNoShows(
//     @Query('propertyId') propertyId: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//     @Res() res?: Response,
//   ) {
//     const records = await this.segments.getNoShowSegment({ propertyId, from, to })
//     return this.respondWithExport(res!, records, 'no-shows', 'csv')
//   }
//
//   // GET /v1/marketing/exports/repeat-guests?propertyId=X&minStays=2
//   @Get('repeat-guests')
//   async exportRepeatGuests(
//     @Query('propertyId') propertyId: string,
//     @Query('minStays') minStays?: string,
//     @Res() res?: Response,
//   ) {
//     const records = await this.segments.getRepeatGuestSegment({
//       propertyId,
//       minStays: minStays ? parseInt(minStays) : 2,
//     })
//     return this.respondWithExport(res!, records, 'huespedes-frecuentes', 'csv')
//   }
//
//   // GET /v1/marketing/exports/high-value?propertyId=X&minRevenue=5000
//   @Get('high-value')
//   async exportHighValue(
//     @Query('propertyId') propertyId: string,
//     @Query('minRevenue') minRevenue?: string,
//     @Res() res?: Response,
//   ) {
//     const records = await this.segments.getHighValueSegment({
//       propertyId,
//       minRevenue: minRevenue ? parseFloat(minRevenue) : undefined,
//     })
//     return this.respondWithExport(res!, records, 'alto-valor', 'csv')
//   }
//
//   // Helper: setea headers y devuelve CSV o JSON
//   private respondWithExport(
//     res: Response,
//     records: ContactRecord[],
//     segmentName: string,
//     format: 'csv' | 'json',
//   ) {
//     if (format === 'json') {
//       return res.json(records)
//     }
//     const csv = this.exports.toCsv(records, segmentName)
//     const filename = `${segmentName}-${new Date().toISOString().slice(0, 10)}.csv`
//     res
//       .header('Content-Type', 'text/csv; charset=utf-8')
//       .header('Content-Disposition', `attachment; filename="${filename}"`)
//       .send(csv)
//   }
// }

export {}
