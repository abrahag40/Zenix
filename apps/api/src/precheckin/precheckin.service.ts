import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { SubmitPrecheckinDto } from './dto/submit-precheckin.dto'

/**
 * PrecheckinService — Sprint AUTO-CHECKIN (2026-06-11), Fase 1 (backend).
 *
 * Pre-arrival identity capture. El huésped recibe un email con un link
 * token-gated (`/precheckin/:token`), corrige sus datos (pre-cargados de Channex)
 * y sube una foto de su ID. Al enviar, Zenix escribe esos datos en la reserva →
 * agiliza (NO elimina) el check-in en recepción.
 *
 * Seguridad / privacidad (decisiones del plan):
 *  - **Token opaco hasheado** (patrón setupTokenHash §179): el raw NUNCA persiste;
 *    la URL nunca expone el ID interno → sin IDOR (D-AC1).
 *  - **Context público mínimo**: solo datos del propio huésped + nombre de la
 *    propiedad + fechas. NUNCA folio, pago, ni IDs internos (data minimization
 *    LFPDPPP/GDPR).
 *  - **Foto vía UploadsService** scope `precheckin` (Sharp + EXIF strip + UUID).
 *    Su retrieval es AUTH-GATED (staff-only) — el huésped sube, recepción ve.
 *  - **Precedencia**: los campos que el huésped corrige se marcan en
 *    `guestVerifiedFields` → el BookingModify de Channex (§136) no los pisa.
 */
@Injectable()
export class PrecheckinService {
  private readonly logger = new Logger(PrecheckinService.name)

  static readonly DEFAULT_TTL_HOURS = 72

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Genera (o regenera) el token de pre-checkin para una reserva. Devuelve el
   * raw token (para el link del email) — solo se persiste su SHA256.
   * Lo llamará el email scheduler/service (Fase 1b).
   */
  async generateToken(
    stayId: string,
    ttlHours: number = PrecheckinService.DEFAULT_TTL_HOURS,
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000)
    await this.prisma.guestStay.update({
      where: { id: stayId },
      data: { precheckinTokenHash: hash, precheckinTokenExpiresAt: expiresAt },
    })
    return { rawToken, expiresAt }
  }

  /** GET público — datos pre-cargados para el formulario del huésped. */
  async getContext(rawToken: string) {
    const stay = await this.lookup(rawToken)
    return this.toPublicContext(stay)
  }

  /** POST público — el huésped confirma/corrige datos + sube foto de ID. */
  async submit(rawToken: string, dto: SubmitPrecheckinDto) {
    const stay = await this.lookup(rawToken)

    if (!dto.consentAccepted) {
      throw new BadRequestException(
        'Debes aceptar el aviso de privacidad para continuar.',
      )
    }

    const verified: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {}
    const setText = (field: keyof SubmitPrecheckinDto, col = field as string) => {
      const v = dto[field]
      if (typeof v === 'string' && v.trim() !== '') {
        data[col] = v.trim()
        verified.push(col)
      }
    }
    setText('guestFirstName')
    setText('guestLastName')
    setText('guestEmail')
    setText('guestPhone')
    setText('nationality')
    setText('guestSex')
    setText('documentType')
    setText('documentNumber')

    // Recomponer guestName si first/last cambiaron (mantiene el campo legacy
    // consistente con los split fields).
    if (data.guestFirstName || data.guestLastName) {
      const fn = data.guestFirstName ?? stay.guestFirstName ?? ''
      const ln = data.guestLastName ?? stay.guestLastName ?? ''
      const composed = `${fn} ${ln}`.trim()
      if (composed) data.guestName = composed
    }

    // Foto de ID — procesada por UploadsService (scope precheckin, orgId del
    // token porque el request es público sin TenantContext).
    let photoCaptured = false
    if (dto.photoBase64 && dto.photoBase64.trim() !== '') {
      const result = await this.uploads.processBase64(
        dto.photoBase64,
        'precheckin',
        stay.organizationId,
      )
      data.documentPhotoUrl = result.url
      photoCaptured = true
      verified.push('documentPhoto')
    }

    data.precheckinSubmittedAt = new Date()
    data.guestVerifiedFields = Array.from(
      new Set([...(stay.guestVerifiedFields ?? []), ...verified]),
    )

    await this.prisma.$transaction([
      this.prisma.guestStay.update({ where: { id: stay.id }, data }),
      this.prisma.guestStayLog.create({
        data: {
          stayId: stay.id,
          event: 'PRECHECKIN_SUBMITTED',
          actorType: 'GUEST',
          metadata: { verifiedFields: verified, photoCaptured },
        },
      }),
    ])

    // Evento para que recepción/dashboard reaccione (bridge SSE en Fase 3).
    this.events.emit('precheckin.submitted', {
      stayId: stay.id,
      propertyId: stay.propertyId,
      photoCaptured,
    })
    this.logger.log(
      `[precheckin] stay=${stay.id} submitted fields=[${verified.join(',')}] photo=${photoCaptured}`,
    )

    return { ok: true, photoCaptured, verifiedFields: verified }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Hash + lookup del token con todos los guards de estado. Lanza la excepción
   * HTTP exacta según el caso para que el frontend mapee a copy específico.
   */
  private async lookup(rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
      throw new BadRequestException('Token inválido.')
    }
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const stay = await this.prisma.guestStay.findUnique({
      where: { precheckinTokenHash: hash },
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        guestName: true,
        guestFirstName: true,
        guestLastName: true,
        guestEmail: true,
        guestPhone: true,
        nationality: true,
        guestSex: true,
        documentType: true,
        documentPhotoUrl: true,
        checkinAt: true,
        scheduledCheckout: true,
        actualCheckout: true,
        cancelledAt: true,
        noShowAt: true,
        precheckinTokenExpiresAt: true,
        precheckinSubmittedAt: true,
        guestVerifiedFields: true,
        // GuestStay no tiene relación directa `property`; el nombre viene por room.
        room: { select: { property: { select: { name: true } } } },
      },
    })
    if (!stay) {
      throw new NotFoundException('Link de pre-check-in inválido.')
    }
    if (!stay.precheckinTokenExpiresAt || stay.precheckinTokenExpiresAt < new Date()) {
      throw new GoneException('Este link expiró. Contacta al hotel para uno nuevo.')
    }
    if (stay.cancelledAt) {
      throw new GoneException('Esta reserva fue cancelada.')
    }
    if (stay.noShowAt) {
      throw new GoneException('Esta reserva ya no está activa.')
    }
    if (stay.actualCheckout) {
      throw new GoneException('Esta estadía ya finalizó.')
    }
    return stay
  }

  /** Proyección pública — solo lo que el huésped puede/debe ver. Sin IDs/folio. */
  private toPublicContext(stay: {
    guestName: string
    guestFirstName: string | null
    guestLastName: string | null
    guestEmail: string | null
    guestPhone: string | null
    nationality: string | null
    guestSex: string | null
    documentType: string | null
    documentPhotoUrl: string | null
    checkinAt: Date
    scheduledCheckout: Date
    precheckinSubmittedAt: Date | null
    room: { property: { name: string } | null } | null
  }) {
    return {
      guestFirstName: stay.guestFirstName,
      guestLastName: stay.guestLastName,
      guestName: stay.guestName,
      guestEmail: stay.guestEmail,
      guestPhone: stay.guestPhone,
      nationality: stay.nationality,
      guestSex: stay.guestSex,
      documentType: stay.documentType,
      propertyName: stay.room?.property?.name ?? null,
      checkIn: stay.checkinAt.toISOString(),
      checkOut: stay.scheduledCheckout.toISOString(),
      alreadySubmitted: !!stay.precheckinSubmittedAt,
      photoCaptured: !!stay.documentPhotoUrl,
    }
  }
}
