/**
 * AggregationService — Data Network Effects cross-propiedad.
 *
 * PSEUDOCODE — implementar en Sprint 9+ cuando haya ~50 propiedades activas.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DATA NETWORK EFFECTS — ESTRATEGIA DE CRECIMIENTO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cada propiedad nueva que adopta Zenix PMS aporta datos de comportamiento
 * de sus huéspedes (OTA de origen, patrones de extensión, tasas de no-show,
 * estacionalidad, perfil de nacionalidades, revenue por tipo de habitación).
 *
 * Con suficiente volumen (~50 propiedades activas en una ciudad o región),
 * estos datos ANONIMIZADOS y AGREGADOS tienen valor de mercado independiente:
 *
 * USE CASE 1 — Benchmarks para operadores (B2B, revenue stream directo):
 *   "Tu tasa de extensión en Cancún en Semana Santa fue 18%.
 *    El promedio de propiedades similares en Cancún: 22%.
 *    Las propiedades top-quartile usan tarifa long-stay desde día 3."
 *   → El operador paga por estos insights para mejorar su pricing/operación.
 *
 * USE CASE 2 — Modelos predictivos de demanda (producto de BI):
 *   Con datos históricos cross-propiedad, construir modelos de forecasting
 *   para la consultora de BI: "En Guadalajara, la ocupación sube 35% las
 *   semanas de ExpoGDL — tus tarifas deberían subir X%."
 *
 * USE CASE 3 — Benchmarks por segmento para OTAs (B2B2C):
 *   Las OTAs pagan por datos de comportamiento de sus partners. Este es el
 *   modelo de negocio de STR (Smith Travel Research) con hoteles de lujo.
 *
 * PRINCIPIOS DE PRIVACIDAD (no negociables):
 * - Opt-in explícito por propiedad (Property.consentToAggregation = true)
 * - Anonimización ANTES de agregar: eliminar nombre, email, documento, teléfono
 * - Granularidad mínima: nunca exponer datos de 1 sola propiedad en un resultado
 *   Si el conjunto tiene < 5 propiedades para un filtro, no retornar (k-anonymity)
 * - Los datos brutos del huésped NUNCA salen de la propiedad que los posee
 *   Solo salen métricas numéricas agregadas
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Schema pendiente para activar este servicio (migración Sprint 9+):
 *
 *   // En el modelo Property:
 *   consentToAggregation  Boolean   @default(false)
 *   consentGrantedAt      DateTime?
 *   consentGrantedById    String?   // staff que otorgó el consentimiento
 *
 *   // Nuevo modelo para los reportes agregados cacheados:
 *   model AggregatedCityReport {
 *     id            String   @id @default(uuid())
 *     city          String
 *     period        String   // 'YYYY-MM' o 'YYYY-Q1'
 *     propertyCount Int      // cuántas propiedades contribuyeron
 *     avgOccupancy  Float
 *     avgRevenue    Decimal
 *     extensionRate Float    // % de estadías que se extendieron
 *     noShowRate    Float
 *     topSources    Json     // { BOOKING: 0.42, AIRBNB: 0.28, DIRECT: 0.30 }
 *     createdAt     DateTime @default(now())
 *     @@unique([city, period])
 *   }
 */

// PSEUDOCODE:
//
// import { Injectable } from '@nestjs/common'
// import { PrismaService } from '../../prisma/prisma.service'
// import { startOfMonth, endOfMonth, format } from 'date-fns'
//
// interface AnonymizedCityReport {
//   city: string
//   period: string           // 'YYYY-MM'
//   propertyCount: number    // número de propiedades que contribuyeron
//   avgOccupancy: number     // % promedio de ocupación
//   avgRevenue: number       // revenue promedio por noche
//   extensionRate: number    // % de estadías con al menos 1 extensión
//   noShowRate: number       // % de reservas marcadas como no-show
//   topSources: Record<string, number>  // { 'BOOKING': 0.42, ... }
// }
//
// @Injectable()
// export class AggregationService {
//   constructor(private prisma: PrismaService) {}
//
//   // Genera reporte agregado anonimizado para todas las propiedades de una ciudad
//   // que dieron consentimiento. Requiere >= 5 propiedades para k-anonymity.
//   async aggregateByCity(city: string, period: string): Promise<AnonymizedCityReport | null> {
//     // 1. Fetch propiedades con consentimiento en la ciudad
//     const properties = await this.prisma.property.findMany({
//       where: { city, consentToAggregation: true },
//       select: { id: true },
//     })
//
//     // k-anonymity: no revelar si hay menos de 5 propiedades
//     if (properties.length < 5) return null
//
//     const [year, month] = period.split('-').map(Number)
//     const from = startOfMonth(new Date(year, month - 1))
//     const to   = endOfMonth(from)
//
//     // 2. Para cada propiedad, calcular métricas del período
//     const metrics = await Promise.all(properties.map(async p => {
//       const [totalStays, noShows, extensions, rooms] = await Promise.all([
//         // Total de estadías que estuvieron activas en el período
//         this.prisma.guestStay.count({
//           where: { propertyId: p.id, checkinAt: { lte: to }, scheduledCheckout: { gte: from } }
//         }),
//         // No-shows del período
//         this.prisma.guestStay.count({
//           where: { propertyId: p.id, noShowAt: { gte: from, lte: to } }
//         }),
//         // Estadías con al menos 1 extensión
//         this.prisma.stayJourney.count({
//           where: {
//             propertyId: p.id,
//             segments: { some: { reason: { in: ['EXTENSION_SAME_ROOM', 'EXTENSION_NEW_ROOM'] } } },
//             journeyCheckIn: { lte: to },
//           }
//         }),
//         // Rooms para calcular ocupación
//         this.prisma.room.count({ where: { propertyId: p.id } }),
//       ])
//
//       // Revenue promedio por noche (solo stays completados)
//       const revResult = await this.prisma.guestStay.aggregate({
//         where: { propertyId: p.id, actualCheckout: { gte: from, lte: to } },
//         _avg: { ratePerNight: true },
//       })
//
//       // Fuentes OTA — distribución porcentual
//       const sourceCounts = await this.prisma.guestStay.groupBy({
//         by: ['source'],
//         where: { propertyId: p.id, checkinAt: { gte: from, lte: to } },
//         _count: true,
//       })
//       const totalWithSource = sourceCounts.reduce((a, s) => a + s._count, 0)
//       const sources = Object.fromEntries(
//         sourceCounts.map(s => [s.source, s._count / (totalWithSource || 1)])
//       )
//
//       // Ocupación simple: noches-huésped / (rooms * días-del-mes)
//       const daysInMonth = to.getDate()
//       const guestNights = await this.prisma.guestStay.aggregate({
//         where: { propertyId: p.id, checkinAt: { lte: to }, scheduledCheckout: { gte: from } },
//         // nights se recalcularía en implementación real
//         _sum: { /* nights */ }
//       })
//       const occupancy = rooms > 0 ? Math.min(1, (totalStays / (rooms * daysInMonth))) : 0
//
//       return {
//         totalStays,
//         noShows,
//         extensions,
//         avgRevenue: revResult._avg.ratePerNight?.toNumber() ?? 0,
//         occupancy,
//         sources,
//       }
//     }))
//
//     // 3. Agregar métricas cross-propiedad (promedio simple — en prod usar media ponderada)
//     const n = metrics.length
//     return {
//       city,
//       period,
//       propertyCount: n,
//       avgOccupancy:   metrics.reduce((a, m) => a + m.occupancy, 0) / n,
//       avgRevenue:     metrics.reduce((a, m) => a + m.avgRevenue, 0) / n,
//       extensionRate:  metrics.reduce((a, m) => a + (m.totalStays > 0 ? m.extensions / m.totalStays : 0), 0) / n,
//       noShowRate:     metrics.reduce((a, m) => a + (m.totalStays > 0 ? m.noShows / m.totalStays : 0), 0) / n,
//       topSources:     this.mergeSourceDistributions(metrics.map(m => m.sources), n),
//     }
//   }
//
//   // Promedia distribuciones de fuentes cross-propiedad
//   private mergeSourceDistributions(
//     distributions: Record<string, number>[],
//     count: number,
//   ): Record<string, number> {
//     const merged: Record<string, number> = {}
//     for (const dist of distributions) {
//       for (const [source, pct] of Object.entries(dist)) {
//         merged[source] = (merged[source] ?? 0) + pct / count
//       }
//     }
//     return merged
//   }
// }

export {}
