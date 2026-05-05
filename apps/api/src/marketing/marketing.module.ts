/**
 * MarketingModule — Sprint 9+ (pseudocode scaffold)
 *
 * Filosofía: este módulo es READ-ONLY sobre datos del PMS.
 * NO modifica GuestStay, StayJourney ni ningún otro modelo operacional.
 * Exporta datos estructurados que el área administrativa lleva a su CRM externo
 * (Mailchimp, HubSpot, Brevo) para ejecutar campañas.
 *
 * Separación PMS ↔ Marketing (Inmon 2005):
 *   PMS  → genera + almacena datos operacionales
 *   Este módulo → agrega + filtra + exporta
 *   CRM externo → ejecuta campañas
 *
 * Data Network Effects (activar a partir de ~50 propiedades):
 *   Cada propiedad aporta datos de comportamiento de huéspedes.
 *   Con consentimiento explícito (Property.consentToAggregation), los datos
 *   ANONIMIZADOS (sin PII) se agregan cross-propiedad para benchmarks de ciudad,
 *   modelos predictivos de demanda, y reportes para la consultora de BI.
 */

// PSEUDOCODE — implementar en Sprint 9+
// import { Module } from '@nestjs/common'
// import { SegmentsService } from './segments/segments.service'
// import { ExportsService } from './exports/exports.service'
// import { ExportsController } from './exports/exports.controller'
// import { AggregationService } from './data-network/aggregation.service'
// import { PrismaModule } from '../prisma/prisma.module'
//
// @Module({
//   imports: [PrismaModule],
//   providers: [SegmentsService, ExportsService, AggregationService],
//   controllers: [ExportsController],
//   exports: [SegmentsService],
// })
// export class MarketingModule {}
//
// Para activar: importar MarketingModule en AppModule y agregar la ruta
// en el router. No requiere migración de schema hasta Data Network Effects.

export {}
