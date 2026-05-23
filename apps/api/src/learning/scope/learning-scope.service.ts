import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { JwtPayload, StaffLevel, StaffRole } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { AccessControlService } from '../../common/access-control/access-control.service'

/**
 * LearningScopeService — autorización Learning-específica respetando
 * el modelo 4-level Brand→Org→LegalEntity→Property (§63-§72) + scope JWT
 * ('BRAND' | 'LEGAL_ENTITY' | 'PROPERTY').
 *
 * Delega a AccessControlService (@Global) para las queries cross-property.
 * Cubre los gaps que detectó la auditoría 2026-05-21 de multi-tenant.
 *
 * Métodos:
 *   - `canActorEnrollStaff(actor, targetStaff)` — antes de crear enrollment
 *   - `canActorReadEnrollment(actor, enrollment)` — antes de leer dashboard
 *   - `accessiblePropertyIds(actor)` — set para filtrar listings
 *   - `accessibleScopeFilter(actor)` — Prisma where fragment reusable
 *
 * Reglas (acumulativas — primer match autoriza):
 *   1. STAFF self-actions (sub === target staff): autoriza
 *   2. SUPERVISOR + scope=PROPERTY: solo staff de su propertyId
 *   3. SUPERVISOR + scope=LEGAL_ENTITY: staff de cualquier property bajo
 *      esa LegalEntity (verificado via AccessControlService)
 *   4. SUPERVISOR + scope=BRAND: staff de cualquier property bajo ese brand
 *   5. ZENIX_ADMIN (futuro): bypass total
 *
 * NOTA: deliberadamente no exportamos `bypassAdminCheck`. El bypass admin
 * vive en AccessControlService (futuro role 'ZENIX_ADMIN' a través del JWT
 * scope='SUPER_ADMIN'). Cuando exista, este service hereda la decisión.
 */
@Injectable()
export class LearningScopeService {
  private readonly logger = new Logger(LearningScopeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * ¿El actor puede crear/modificar enrollment del staff target?
   * Regla: self-enroll siempre OK; cross-staff requiere SUPERVISOR + scope
   * que cubra el property del target.
   */
  async canActorEnrollStaff(actor: JwtPayload, targetStaffId: string): Promise<boolean> {
    // Self-enroll: siempre OK
    if (actor.sub === targetStaffId) return true

    // Cross-staff requiere SUPERVISOR (o nivel LEAD jerárquico Sprint 9)
    const isSupervisor =
      actor.role === StaffRole.SUPERVISOR || actor.level === StaffLevel.LEAD
    if (!isSupervisor) return false

    // Resolver propertyId del target
    const target = await this.prisma.staff.findUnique({
      where: { id: targetStaffId },
      select: { id: true, propertyId: true, organizationId: true, active: true },
    })
    if (!target || !target.active) return false

    // Same org siempre requerido (hard barrier)
    if (target.organizationId !== actor.organizationId) return false

    // Si actor scope=PROPERTY: solo si match exacto
    const scope = actor.scope ?? 'PROPERTY'
    if (scope === 'PROPERTY') {
      return target.propertyId === actor.propertyId
    }

    // scope=LEGAL_ENTITY o BRAND: delegar a AccessControlService para
    // confirmar que el actor tiene grant sobre target.propertyId
    return this.accessControl.canUserAccessProperty(actor.sub, target.propertyId)
  }

  /**
   * ¿El actor puede leer este enrollment (dashboard, reports, etc.)?
   * Regla: self lee lo suyo; supervisor lee scope completo.
   */
  async canActorReadEnrollment(
    actor: JwtPayload,
    enrollment: { staffId: string; propertyId: string | null },
  ): Promise<boolean> {
    if (actor.sub === enrollment.staffId) return true
    const isSupervisor =
      actor.role === StaffRole.SUPERVISOR || actor.level === StaffLevel.LEAD
    if (!isSupervisor) return false
    if (!enrollment.propertyId) return false // legacy: si no tiene property, no leak
    const scope = actor.scope ?? 'PROPERTY'
    if (scope === 'PROPERTY') return enrollment.propertyId === actor.propertyId
    return this.accessControl.canUserAccessProperty(actor.sub, enrollment.propertyId)
  }

  /**
   * Set de propertyIds que el actor puede ver según su scope efectivo.
   * Útil para filtrar listings (catálogo, dashboards, reports).
   *
   * PROPERTY scope → Set([actor.propertyId])
   * LEGAL_ENTITY/BRAND scope → delega a AccessControlService.listAccessiblePropertyIds
   */
  async accessiblePropertyIds(actor: JwtPayload): Promise<Set<string>> {
    const scope = actor.scope ?? 'PROPERTY'
    if (scope === 'PROPERTY') return new Set([actor.propertyId])
    return this.accessControl.listAccessiblePropertyIds(actor.sub)
  }

  /**
   * Set de legalEntityIds que el actor puede ver según scope efectivo.
   * Útil para reporting compliance STPS (donde el agregado se hace per
   * LegalEntity = razón social).
   */
  async accessibleLegalEntityIds(actor: JwtPayload): Promise<Set<string>> {
    const propertyIds = await this.accessiblePropertyIds(actor)
    if (propertyIds.size === 0) return new Set()

    const properties = await this.prisma.property.findMany({
      where: { id: { in: [...propertyIds] } },
      select: { legalEntityId: true },
    })
    return new Set(properties.map((p) => p.legalEntityId).filter((id): id is string => !!id))
  }

  /**
   * Throw helper — usado por servicios para guard fail-loud en lugar de
   * `if (!canActor...) throw`.
   */
  async assertActorCanEnrollStaff(actor: JwtPayload, targetStaffId: string): Promise<void> {
    const ok = await this.canActorEnrollStaff(actor, targetStaffId)
    if (!ok) {
      throw new ForbiddenException(
        'No tienes permiso para asignar cursos a este staff. Verifica tu scope (PROPERTY/LEGAL_ENTITY/BRAND) y que la sucursal del staff esté en tu jurisdicción.',
      )
    }
  }

  async assertActorCanReadEnrollment(
    actor: JwtPayload,
    enrollment: { staffId: string; propertyId: string | null },
  ): Promise<void> {
    const ok = await this.canActorReadEnrollment(actor, enrollment)
    if (!ok) {
      throw new ForbiddenException('No autorizado para leer este enrollment')
    }
  }
}
