/**
 * WizardActivationService — transactional create del cliente al finalizar
 * el wizard (Step 8, §174 D-NOVA-16).
 *
 * Una transacción Postgres atómica crea:
 *   1. Organization (isActive=false hasta que el Org Owner active su setup link)
 *   2. Brand (si brandEnabled)
 *   3. LegalEntity bajo la Organization
 *   4. Properties (N) bajo la LegalEntity con timezone individual
 *   5. User placeholder ORG_OWNER (isActive=false, password=placeholder, awaiting activation)
 *   6. UserPropertyRole entries para cada property (ORG_OWNER puede operar todas)
 *
 * Outside-tx (best-effort):
 *   · AuditLogService.write — ORGANIZATION_ACTIVATED con actorRealId del consultor
 *   · Day 17: Resend email con setup link al Org Owner + PDF report adjunto
 *
 * Setup link contiene un token random 32-byte hex que NO persiste todavía
 * (Day 17 agrega columna User.setupToken + User.setupTokenExpiresAt y la
 * lógica de activación). Day 16 deja el token en response — el consultor
 * lo copia manualmente al email del cliente como fallback temporal.
 */
import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import * as crypto from 'crypto'
import * as bcrypt from 'bcrypt'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditLogService } from '../audit/audit-log.service'
import { ActivationEmailService } from './activation-email.service'
import type { WizardActivateDto, WizardActivateResponse } from './dto/wizard-dto'

@Injectable()
export class WizardActivationService {
  private readonly logger = new Logger(WizardActivationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly emailService: ActivationEmailService,
  ) {}

  async activate(dto: WizardActivateDto, actor: JwtPayload): Promise<WizardActivateResponse> {
    // Pre-flight checks fuera de la transacción para fail-fast
    await this.preflightChecks(dto)

    // Day 17 — Setup token persistido en User.setupTokenHash con TTL 72h.
    //   · raw token (32 bytes hex) → email link, NUNCA en BD
    //   · hash SHA256 → BD column, lookup O(1) (UNIQUE constraint)
    //   · placeholderPasswordHash → bcrypt de un secret derivado del raw token,
    //     evita que el User pueda loguear hasta activar (no se publica este hash)
    const setupTokenRaw = crypto.randomBytes(32).toString('hex')
    const setupTokenHash = crypto.createHash('sha256').update(setupTokenRaw).digest('hex')
    const setupTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72h
    const placeholderPasswordHash = await bcrypt.hash(`__pending_${setupTokenRaw}`, 10)

    const created = await this.prisma.$transaction(async (tx) => {
      // ── (1) Organization ─────────────────────────────────────
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug: dto.organizationSlug,
          countryCode: dto.organizationCountryCode,
          timezone: dto.organizationTimezone,
          currency: dto.legalEntityBaseCurrency,
          isActive: false, // queda en ONBOARDING hasta que Owner active
        },
      })

      // ── (2) Brand (opcional) ─────────────────────────────────
      let brandId: string | null = null
      if (dto.brandEnabled && dto.brandName?.trim()) {
        const brand = await tx.brand.create({
          data: {
            name: dto.brandName.trim(),
            slug: `${dto.organizationSlug}-brand`,
            logoUrl: dto.brandLogoUrl?.trim() || null,
          },
        })
        brandId = brand.id
        await tx.organization.update({
          where: { id: org.id },
          data: { brandId },
        })
      }

      // ── (3) LegalEntity ──────────────────────────────────────
      const legalEntity = await tx.legalEntity.create({
        data: {
          organizationId: org.id,
          countryCode: dto.organizationCountryCode,
          name: dto.legalEntityName.trim(),
          taxId: dto.legalEntityTaxId.toUpperCase().trim(),
          legalAddress: {
            // Day 16 stub — Day 17 captura address completo del cliente
            country: dto.organizationCountryCode,
          },
          baseCurrency: dto.legalEntityBaseCurrency,
          // pacAdapter elegido pero PAC override warnea — guardamos en
          // pacCredentials como placeholder hasta que cliente configure real.
          pacCredentials: {
            adapter: dto.legalEntityPacAdapter,
            pendingConfiguration: true,
            overrideAccepted: dto.pacOverrideAccepted ?? false,
          },
          active: true,
        },
      })

      // ── (4) Properties ───────────────────────────────────────
      const propertyIds: string[] = []
      for (const prop of dto.properties) {
        const created = await tx.property.create({
          data: {
            organizationId: org.id,
            legalEntityId: legalEntity.id,
            name: prop.name.trim(),
            type: prop.type,
            city: prop.cityDisplay || prop.cityFreeText || null,
            isActive: false, // inactiva hasta que Org Owner active sus credenciales
          },
        })
        propertyIds.push(created.id)

        // PropertySettings con timezone capturado en el wizard
        await tx.propertySettings.create({
          data: {
            propertyId: created.id,
            organizationId: org.id,
            timezone: prop.timezone,
          },
        })
      }

      // ── (5) Org Owner User placeholder + setup token ────────
      const orgOwner = await tx.user.create({
        data: {
          organizationId: org.id,
          email: dto.orgOwnerEmail.toLowerCase().trim(),
          passwordHash: placeholderPasswordHash, // user no puede loguear con esto
          firstName: dto.orgOwnerName.split(' ')[0] ?? dto.orgOwnerName,
          lastName: dto.orgOwnerName.split(' ').slice(1).join(' ') || '—',
          systemRole: 'ORG_OWNER',
          isActive: false, // queda PENDING_ACTIVATION
          // Day 17 — Setup token persistido (SOLO hash, raw va al email)
          setupTokenHash,
          setupTokenExpiresAt,
        },
      })

      // ── (6) UserPropertyRole para cada property ─────────────
      // ORG_OWNER tiene OWNER en cada property — backward-compat con SystemRole
      // legacy mientras LegalEntityUserRole + BrandUserRole se popularizan.
      for (const propertyId of propertyIds) {
        await tx.userPropertyRole.create({
          data: {
            userId: orgOwner.id,
            propertyId,
            role: 'OWNER',
          },
        })
      }

      return {
        organizationId: org.id,
        brandId,
        legalEntityId: legalEntity.id,
        propertyIds,
        orgOwnerUserId: orgOwner.id,
      }
    })

    // ── AuditLog (outside-tx best-effort) ──────────────────────
    let auditLogged = true
    try {
      await this.auditLog.write({
        organizationId: created.organizationId,
        actorRealId: actor.sub,
        actorRealRole: actor.role as never,
        action: 'ORGANIZATION_ACTIVATED',
        target: created.organizationId,
        payload: {
          organizationName: dto.organizationName,
          legalEntityName: dto.legalEntityName,
          legalEntityTaxId: dto.legalEntityTaxId.toUpperCase(),
          propertyCount: dto.properties.length,
          inventoryTemplate: dto.inventoryTemplate,
          orgOwnerEmail: dto.orgOwnerEmail,
          pacOverrideAccepted: dto.pacOverrideAccepted ?? false,
          brandEnabled: dto.brandEnabled,
          setupTokenHash, // SOLO el hash, NUNCA el raw token
        },
        status: 'SUCCESS',
        reason: `Wizard activation completed by ${actor.role}`,
        retentionPolicy: 'PERMANENT',
      })
    } catch (err) {
      auditLogged = false
      this.logger.error(
        `[WizardActivation] AuditLog write failed for org ${created.organizationId}: ${String(err)}`,
      )
    }

    // ── Setup link ───────────────────────────────────────────
    const baseUrl = process.env.APP_BASE_URL || 'https://app.zenix.com'
    const ownerSetupLink = `${baseUrl}/setup/${setupTokenRaw}`

    // ── Auto-email (Day 18) — best-effort, NO bloquea ────────
    // El consultor sigue viendo el setup link en la UI como fallback aún
    // cuando el email se envía exitosamente. Permite copy-paste manual al
    // cliente vía WhatsApp/Slack si por alguna razón el email no llega.
    let emailSent = false
    try {
      const apiBaseUrl = process.env.NOVA_BASE_URL || baseUrl.replace('app.', 'nova.')
      const activationReportLink = `${apiBaseUrl}/v1/nova/wizard/activation-report/${created.organizationId}`
      const emailResult = await this.emailService.sendActivationEmail({
        to: dto.orgOwnerEmail,
        ownerName: dto.orgOwnerName,
        organizationName: dto.organizationName,
        setupLink: ownerSetupLink,
        hoursUntilExpiry: 72,
        propertyCount: dto.properties.length,
        activationReportLink,
      })
      emailSent = emailResult.sent
      if (!emailResult.sent) {
        this.logger.warn(
          `[WizardActivation] Email NO enviado (reason=${emailResult.reason}) — setup link queda como copy-paste manual.`,
        )
      }
    } catch (err) {
      this.logger.error(
        `[WizardActivation] Email service threw unexpectedly: ${String(err)}. Setup link queda en response para copy-paste manual.`,
      )
    }

    this.logger.log(
      `[WizardActivation] Organization "${dto.organizationName}" (${created.organizationId}) activated by actor ${actor.sub}. Setup link generated (token hash ${setupTokenHash.slice(0, 8)}…). ${dto.properties.length} properties seeded. Email sent=${emailSent}.`,
    )

    return {
      organizationId: created.organizationId,
      legalEntityId: created.legalEntityId,
      brandId: created.brandId,
      propertyIds: created.propertyIds,
      orgOwnerUserId: created.orgOwnerUserId,
      ownerSetupLink,
      activatedAt: new Date().toISOString(),
      auditLogged,
      emailSent,
    }
  }

  // ─── Pre-flight ───────────────────────────────────────────────

  private async preflightChecks(dto: WizardActivateDto): Promise<void> {
    if (dto.properties.length === 0) {
      throw new BadRequestException('Wizard activation: al menos 1 property es requerida')
    }
    if (dto.properties.length > 50) {
      throw new BadRequestException(
        'Wizard activation: max 50 properties per activation. Para chains más grandes contactar soporte.',
      )
    }

    // Slug unique check
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.organizationSlug },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException(
        `El slug "${dto.organizationSlug}" ya está en uso. Elige otro o agrega un sufijo (e.g. ${dto.organizationSlug}-2026).`,
      )
    }

    // Email unique check (User.email is @unique)
    const emailExists = await this.prisma.user.findUnique({
      where: { email: dto.orgOwnerEmail.toLowerCase().trim() },
      select: { id: true },
    })
    if (emailExists) {
      throw new ConflictException(
        `El email ${dto.orgOwnerEmail} ya existe en Zenix. Si es la misma persona dueña de otra cuenta, usa un alias o agrégalo post-activación.`,
      )
    }

    // Tax ID unique within Organization (no se enforce todavía a nivel global porque
    // multi-country puede tener mismo número con diferente country prefix).
    const taxIdInUse = await this.prisma.legalEntity.findFirst({
      where: {
        taxId: dto.legalEntityTaxId.toUpperCase().trim(),
        countryCode: dto.organizationCountryCode,
      },
      select: { id: true, organizationId: true },
    })
    if (taxIdInUse) {
      this.logger.warn(
        `[WizardActivation] Tax ID ${dto.legalEntityTaxId} already exists in country ${dto.organizationCountryCode} (org ${taxIdInUse.organizationId}). Allowing activation but flagging for review.`,
      )
      // No bloqueamos — caso legítimo: misma RFC puede tener múltiples Organizations
      // en Zenix (e.g. consultor de prueba). Day 17 podría agregar warning UI.
    }
  }
}
