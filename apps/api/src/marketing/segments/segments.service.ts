/**
 * SegmentsService — lógica de segmentación de huéspedes para marketing.
 *
 * PSEUDOCODE — implementar en Sprint 9+
 *
 * Cuatro segmentos MVP identificados por análisis operacional:
 *
 * 1. getExtensionSegment  — huéspedes que extendieron su estadía
 *    Fuente: StaySegment WHERE reason IN [EXTENSION_SAME_ROOM, EXTENSION_NEW_ROOM]
 *    Insight: estos huéspedes tienen disposición alta a quedarse más tiempo →
 *    candidatos para upgrades, paquetes long-stay, fidelización.
 *    Export típico: llevar a Mailchimp → campaña "Vuelve y extiende, 10% off".
 *
 * 2. getNoShowSegment — no-shows del período
 *    Fuente: GuestStay WHERE noShowAt IS NOT NULL AND chargeStatus != 'CHARGED'
 *    Insight: reservaron pero no llegaron → posible intención real de visita,
 *    problema de viaje, o abandono. Candidatos para win-back con incentivo.
 *    ADVERTENCIA: solo incluir si tienen email/teléfono capturado antes del no-show.
 *
 * 3. getRepeatGuestSegment — huéspedes con >1 estadía
 *    Fuente: GROUP BY guestEmail HAVING COUNT(*) >= minStays (default 2)
 *    Insight: ya confían en la propiedad → candidatos para programa de fidelidad,
 *    tarifa preferencial, o campañas de referral ("trae a un amigo").
 *
 * 4. getHighValueSegment — huéspedes con revenue total > threshold
 *    Fuente: GROUP BY guestEmail SUM(totalAmount) >= minRevenue
 *    Insight: los 20% de huéspedes que generan el 80% del revenue (Pareto) →
 *    candidatos para trato VIP, early check-in, late checkout, upgrades.
 */

// PSEUDOCODE:
//
// import { Injectable } from '@nestjs/common'
// import { PrismaService } from '../../prisma/prisma.service'
// import { SegmentReason } from '@prisma/client'
// import type { SegmentFilterDto, ContactRecord } from './dto/segment-filter.dto'
// import { subDays } from 'date-fns'
//
// @Injectable()
// export class SegmentsService {
//   constructor(private prisma: PrismaService) {}
//
//   // Segmento 1: Huéspedes que extendieron
//   async getExtensionSegment(dto: SegmentFilterDto): Promise<ContactRecord[]> {
//     const from = dto.from ? new Date(`${dto.from}T00:00:00Z`) : subDays(new Date(), 30)
//     const to   = dto.to   ? new Date(`${dto.to}T23:59:59Z`)  : new Date()
//
//     // Buscar segmentos de extensión cuyo checkIn cae en el rango
//     const segments = await this.prisma.staySegment.findMany({
//       where: {
//         journey: { propertyId: dto.propertyId },
//         reason: { in: [SegmentReason.EXTENSION_SAME_ROOM, SegmentReason.EXTENSION_NEW_ROOM] },
//         checkIn: { gte: from, lte: to },
//         // Solo incluir si tienen datos de contacto — sin email/teléfono el export es inútil
//         journey: { guestStay: { OR: [
//           { guestEmail: { not: null } },
//           { guestPhone: { not: null } },
//         ]}}
//       },
//       include: {
//         journey: { include: { guestStay: true } }
//       },
//       // Un huésped puede extender varias veces — de-duplicar por journeyId
//       distinct: ['journeyId'],
//     })
//
//     return segments.map(seg => this.toContactRecord(seg.journey.guestStay!, ['extended']))
//   }
//
//   // Segmento 2: No-shows con datos de contacto
//   async getNoShowSegment(dto: SegmentFilterDto): Promise<ContactRecord[]> {
//     const from = dto.from ? new Date(`${dto.from}T00:00:00Z`) : subDays(new Date(), 30)
//     const to   = dto.to   ? new Date(`${dto.to}T23:59:59Z`)  : new Date()
//
//     const stays = await this.prisma.guestStay.findMany({
//       where: {
//         propertyId: dto.propertyId,
//         noShowAt: { gte: from, lte: to, not: null },
//         OR: [{ guestEmail: { not: null } }, { guestPhone: { not: null } }],
//       },
//     })
//
//     return stays.map(s => this.toContactRecord(s, ['no-show']))
//   }
//
//   // Segmento 3: Huéspedes frecuentes
//   async getRepeatGuestSegment(dto: SegmentFilterDto): Promise<ContactRecord[]> {
//     const minStays = dto.minStays ?? 2
//
//     // Prisma groupBy no soporta HAVING directamente — usar raw query
//     const rows = await this.prisma.$queryRaw<{
//       guestEmail: string; count: number; totalRevenue: number; lastCheckIn: Date
//     }[]>`
//       SELECT "guestEmail", COUNT(*) as count,
//              SUM("totalAmount") as "totalRevenue",
//              MAX("checkinAt") as "lastCheckIn"
//       FROM   "GuestStay"
//       WHERE  "propertyId" = ${dto.propertyId}
//         AND  "guestEmail" IS NOT NULL
//         AND  "actualCheckout" IS NOT NULL   -- solo estadías completadas
//       GROUP BY "guestEmail"
//       HAVING COUNT(*) >= ${minStays}
//       ORDER BY count DESC
//     `
//
//     // Nota: para exportar se necesitaría fetch completo del último stay para
//     // obtener guestName, guestPhone, nationality. Omitido en pseudocode por brevedad.
//     return rows.map(r => ({
//       guestName: '',        // fetch en implementación real
//       guestEmail: r.guestEmail,
//       totalStays: Number(r.count),
//       totalRevenue: Number(r.totalRevenue),
//       segmentTags: ['repeat'],
//       // ...resto de campos
//     } as ContactRecord))
//   }
//
//   // Segmento 4: Huéspedes de alto valor
//   async getHighValueSegment(dto: SegmentFilterDto): Promise<ContactRecord[]> {
//     const minRevenue = dto.minRevenue ?? 5000  // default: $5,000 en moneda local
//
//     const rows = await this.prisma.$queryRaw<{
//       guestEmail: string; totalRevenue: number; stayCount: number
//     }[]>`
//       SELECT "guestEmail", SUM("totalAmount") as "totalRevenue", COUNT(*) as "stayCount"
//       FROM   "GuestStay"
//       WHERE  "propertyId" = ${dto.propertyId}
//         AND  "guestEmail" IS NOT NULL
//         AND  "paymentStatus" IN ('PAID', 'PARTIAL')
//       GROUP BY "guestEmail"
//       HAVING SUM("totalAmount") >= ${minRevenue}
//       ORDER BY "totalRevenue" DESC
//     `
//
//     return rows.map(r => ({
//       guestEmail: r.guestEmail,
//       totalRevenue: Number(r.totalRevenue),
//       totalStays: Number(r.stayCount),
//       segmentTags: ['high-value'],
//     } as ContactRecord))
//   }
//
//   // Helper: GuestStay → ContactRecord
//   private toContactRecord(stay: any, tags: string[]): ContactRecord {
//     return {
//       guestName:   stay.guestName,
//       guestEmail:  stay.guestEmail  ?? undefined,
//       guestPhone:  stay.guestPhone  ?? undefined,
//       nationality: stay.nationality ?? undefined,
//       source:      stay.source,
//       lastCheckIn: stay.checkinAt,
//       lastCheckOut: stay.scheduledCheckout,
//       totalStays:   1,
//       totalRevenue: Number(stay.totalAmount),
//       currency:     stay.currency ?? 'MXN',
//       segmentTags:  tags,
//     }
//   }
// }

export {}
