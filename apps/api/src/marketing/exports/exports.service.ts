/**
 * ExportsService — generación de exports CSV/JSON de segmentos de marketing.
 *
 * PSEUDOCODE — implementar en Sprint 9+
 *
 * Responsabilidad: tomar el output de SegmentsService y serializarlo en el
 * formato que espera el CRM destino del operador.
 *
 * Formatos soportados (MVP):
 * - CSV con BOM UTF-8 (compatible con Excel LATAM — mismo patrón que ReportsPage)
 * - JSON (para integraciones directas vía API — Mailchimp, HubSpot, Brevo)
 *
 * Integraciones externas en roadmap (Sprint 10+):
 * - Mailchimp: POST /3.0/lists/{listId}/members (bulk import)
 * - HubSpot: POST /crm/v3/objects/contacts/batch/create
 * - Brevo (ex-Sendinblue): POST /v3/contacts/import
 * Cada integración requiere un API key configurado en PropertySettings.
 * El PMS NUNCA almacena credenciales de CRM en texto plano — usar secret manager
 * (AWS Secrets Manager o variable de entorno cifrada).
 */

// PSEUDOCODE:
//
// import { Injectable } from '@nestjs/common'
// import type { ContactRecord } from '../segments/dto/segment-filter.dto'
//
// @Injectable()
// export class ExportsService {
//
//   // Genera CSV compatible con Excel LATAM (BOM UTF-8, separador coma)
//   toCsv(records: ContactRecord[], segmentName: string): string {
//     const BOM = '\uFEFF'
//     const headers = [
//       'Nombre', 'Email', 'Teléfono', 'Nacionalidad', 'Canal',
//       'Último check-in', 'Último check-out',
//       'Total estadías', 'Revenue total', 'Moneda', 'Segmentos',
//     ]
//
//     const rows = records.map(r => [
//       r.guestName,
//       r.guestEmail ?? '',
//       r.guestPhone ?? '',
//       r.nationality ?? '',
//       r.source,
//       r.lastCheckIn.toISOString().slice(0, 10),
//       r.lastCheckOut.toISOString().slice(0, 10),
//       String(r.totalStays),
//       r.totalRevenue.toFixed(2),
//       r.currency,
//       r.segmentTags.join('|'),
//     ].map(v => `"${String(v).replace(/"/g, '""')}"`))
//
//     return BOM + [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
//   }
//
//   // Formatea para Mailchimp bulk import
//   // Ver: https://mailchimp.com/developer/marketing/api/list-members/
//   toMailchimpBatch(records: ContactRecord[]): object[] {
//     return records
//       .filter(r => !!r.guestEmail)  // Mailchimp requiere email
//       .map(r => ({
//         email_address: r.guestEmail,
//         status: 'subscribed',
//         merge_fields: {
//           FNAME: r.guestName.split(' ')[0] ?? r.guestName,
//           LNAME: r.guestName.split(' ').slice(1).join(' ') ?? '',
//           PHONE: r.guestPhone ?? '',
//         },
//         tags: r.segmentTags,
//       }))
//   }
//
//   // Formatea para HubSpot bulk create
//   // Ver: https://developers.hubspot.com/docs/api/crm/contacts
//   toHubSpotBatch(records: ContactRecord[]): object[] {
//     return records
//       .filter(r => !!r.guestEmail)
//       .map(r => ({
//         properties: {
//           email:        r.guestEmail,
//           firstname:    r.guestName.split(' ')[0] ?? '',
//           lastname:     r.guestName.split(' ').slice(1).join(' ') ?? '',
//           phone:        r.guestPhone ?? '',
//           // Custom properties en HubSpot (requieren configuración previa en el portal):
//           last_stay_source:   r.source,
//           last_checkin_date:  r.lastCheckIn.toISOString().slice(0, 10),
//           pms_segment:        r.segmentTags.join(';'),
//         },
//       }))
//   }
// }

export {}
