/**
 * SetupService — consume del setup token del Org Owner (Day 17, §174 D-NOVA-16).
 *
 * Flow:
 *   1. Wizard activate (Day 16) crea User con setup_token_hash + expiresAt 72h
 *   2. Email automático (Day 18 Resend) envía link /setup/:rawToken
 *   3. Org Owner abre el link → GET /v1/auth/setup/:rawToken
 *      Server hashea raw, valida (no consumed + no expired), retorna metadata
 *   4. Org Owner submite password → POST /v1/auth/setup/:rawToken
 *      Server valida otra vez, set passwordHash + isActive=true (user + org +
 *      properties) + consumedAt=now + emit AuditLog OWNER_SETUP_COMPLETED.
 *      Auto-login: retorna JWT para que el cliente entre directo a /app.
 *
 * Single-use enforcement:
 *   · consumedAt != null → 410 Gone "Este link ya fue utilizado"
 *   · expiresAt < now    → 410 Gone "Este link expiró — pide uno nuevo al consultor"
 *
 * Re-uses (browser back button, double submit) son rechazados sin ambigüedad.
 */
import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditLogService } from '../audit/audit-log.service'

const MIN_PASSWORD_LENGTH = 10
const BCRYPT_ROUNDS = 12

export interface SetupMetadataResponse {
  organizationName: string
  organizationSlug: string
  ownerEmail: string
  ownerName: string
  hoursRemaining: number
  /** Si propertyCount > 0, mostramos en la UI confirmación que el wizard
   *  realmente creó las properties (transparencia para el Org Owner). */
  propertyCount: number
}

export interface SetupActivateResponse {
  access_token: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    organizationId: string
  }
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * GET /v1/auth/setup/:token — metadata para la página de setup.
   * Public endpoint (sin JWT).
   */
  async getMetadata(rawToken: string): Promise<SetupMetadataResponse> {
    const user = await this.lookupByRawToken(rawToken)

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId! },
      select: { name: true, slug: true, properties: { select: { id: true } } },
    })
    if (!org) {
      // Schema corruption — el setup token apunta a un User con organizationId
      // que no existe. No debería pasar pero defensive.
      throw new NotFoundException('Organización no encontrada — contacta a tu consultor.')
    }

    const hoursRemaining = Math.max(
      0,
      Math.floor((user.setupTokenExpiresAt!.getTime() - Date.now()) / (1000 * 60 * 60)),
    )

    return {
      organizationName: org.name,
      organizationSlug: org.slug,
      ownerEmail: user.email,
      ownerName: `${user.firstName} ${user.lastName}`.trim(),
      hoursRemaining,
      propertyCount: org.properties.length,
    }
  }

  /**
   * POST /v1/auth/setup/:token — activación final del Org Owner.
   * Public endpoint. Body: { password }.
   *
   * Side effects:
   *   · User.passwordHash = bcrypt(password)
   *   · User.isActive = true
   *   · User.setupTokenConsumedAt = now
   *   · Organization.isActive = true
   *   · Properties[].isActive = true (todas las del org)
   *   · AuditLog OWNER_SETUP_COMPLETED append-only
   *
   * Devuelve JWT para auto-login (el cliente va directo a /app sin re-login).
   */
  async activate(rawToken: string, password: string): Promise<SetupActivateResponse> {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      )
    }
    if (password.length > 200) {
      throw new BadRequestException('La contraseña excede el máximo permitido (200 chars).')
    }

    const user = await this.lookupByRawToken(rawToken)
    const newPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const now = new Date()

    const activated = await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction para prevenir TOCTOU
      // (otro request concurrente podría haber consumido el token).
      const userFresh = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          organizationId: true,
          setupTokenConsumedAt: true,
          setupTokenExpiresAt: true,
        },
      })
      if (!userFresh || userFresh.setupTokenConsumedAt) {
        throw new GoneException(
          'Este link ya fue utilizado. Si necesitas otro, pide al consultor que re-emita el setup link.',
        )
      }
      if (!userFresh.setupTokenExpiresAt || userFresh.setupTokenExpiresAt < now) {
        throw new GoneException(
          'El link expiró. Pide al consultor que re-emita el setup link (válido 72h).',
        )
      }

      // (1) User activación
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          isActive: true,
          setupTokenConsumedAt: now,
          // Nullear hash + expiresAt para que un eventual DB dump no exponga
          // el hash post-uso. El consumedAt persiste como forensic trail.
          setupTokenHash: null,
          setupTokenExpiresAt: null,
        },
      })

      // (2) Organization activación
      await tx.organization.update({
        where: { id: userFresh.organizationId! },
        data: { isActive: true },
      })

      // (3) Properties activación bulk
      await tx.property.updateMany({
        where: { organizationId: userFresh.organizationId! },
        data: { isActive: true },
      })

      return updatedUser
    })

    // ── AuditLog outside-tx ──────────────────────────────────────
    try {
      await this.auditLog.write({
        organizationId: activated.organizationId!,
        actorRealId: activated.id, // El propio Org Owner ejecuta su activación
        actorRealRole: 'ORG_OWNER' as never,
        action: 'OWNER_SETUP_COMPLETED',
        target: activated.id,
        payload: {
          activatedAt: now.toISOString(),
          // NUNCA logueamos el password ni el rawToken
        },
        status: 'SUCCESS',
        retentionPolicy: 'PERMANENT',
      })
    } catch (err) {
      this.logger.error(
        `[Setup] AuditLog write failed for user ${activated.id}: ${String(err)}`,
      )
      // No bloquea — el setup ya completó.
    }

    this.logger.log(
      `[Setup] Org Owner ${activated.email} (${activated.id}) activated successfully. Organization ${activated.organizationId} now active.`,
    )

    // ── Auto-login JWT ───────────────────────────────────────────
    // Para que el cliente vaya directo a /app sin re-login.
    const access_token = this.jwt.sign({
      sub: activated.id,
      email: activated.email,
      role: 'OWNER',
      systemRole: 'ORG_OWNER',
      organizationId: activated.organizationId!,
      propertyId: '', // el cliente selecciona property post-login si tiene varias
      actorTier: 'ORG_OWNER',
    } as any)

    return {
      access_token,
      user: {
        id: activated.id,
        email: activated.email,
        firstName: activated.firstName,
        lastName: activated.lastName,
        organizationId: activated.organizationId!,
      },
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Hash + lookup del token. Centraliza las validaciones para evitar code
   * duplication entre GET y POST. Lanza la excepción HTTP exacta según el
   * estado (404 / 410 / etc.) para que el frontend mapee a copy específico.
   */
  private async lookupByRawToken(rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
      throw new BadRequestException('Token inválido.')
    }
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const user = await this.prisma.user.findUnique({
      where: { setupTokenHash: hash },
      select: {
        id: true,
        organizationId: true,
        email: true,
        firstName: true,
        lastName: true,
        setupTokenExpiresAt: true,
        setupTokenConsumedAt: true,
        isActive: true,
      },
    })
    if (!user) {
      throw new NotFoundException(
        'Setup link inválido o ya consumido. Si crees que es un error, contacta a tu consultor.',
      )
    }
    if (user.setupTokenConsumedAt) {
      throw new GoneException(
        'Este setup link ya fue utilizado. Pide al consultor que re-emita uno nuevo si necesitas.',
      )
    }
    if (!user.setupTokenExpiresAt || user.setupTokenExpiresAt < new Date()) {
      throw new GoneException(
        'El setup link expiró. Pide al consultor que re-emita el link (vigencia 72h).',
      )
    }
    return user
  }
}
