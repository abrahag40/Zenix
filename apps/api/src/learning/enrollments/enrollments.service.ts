import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, LearningEnrollmentStatus } from '@prisma/client'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { LearningScopeService } from '../scope/learning-scope.service'

export interface CreateEnrollmentDto {
  courseId: string
  staffId?: string // si null = self-enroll del actor
  enrollmentReason?:
    | 'SELF_ENROLL'
    | 'ASSIGNED_BY_MANAGER'
    | 'ASSIGNMENT_RULE'
    | 'GIFT_AT_ACTIVATION'
    | 'RECERTIFICATION'
}

/**
 * EnrollmentsService — lifecycle del enrollment de un staff a un curso.
 *
 * Estados (LearningEnrollmentStatus):
 *   NOT_STARTED → IN_PROGRESS → COMPLETED | FAILED | EXPIRED | CANCELLED
 *
 * Reglas de auth:
 *   - SELF_ENROLL: staff puede self-enrollar a cursos tier=CORE o GIFT
 *   - ASSIGNED_BY_MANAGER: SUPERVISOR puede asignar a su staff del mismo property
 *   - ASSIGNMENT_RULE: scheduler/rule engine, sin actor staff
 *   - GIFT_AT_ACTIVATION: Zenix Activate wizard al cerrar PMS deal
 *   - RECERTIFICATION: scheduler `RecertificationScheduler` al expirar
 *
 * §129 (reservado): contentVersionPin snapshotea la versión del curso al
 * enroll. Audit fiscal LFT.
 */
@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly scope: LearningScopeService,
  ) {}

  async create(dto: CreateEnrollmentDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()

    // Resolver staffId — self-enroll vs admin-assign
    const targetStaffId = dto.staffId ?? actor.sub
    const isSelfEnroll = targetStaffId === actor.sub
    const reason = dto.enrollmentReason ?? (isSelfEnroll ? 'SELF_ENROLL' : 'ASSIGNED_BY_MANAGER')

    // §multi-tenant 2026-05-21 — auth via LearningScopeService respeta scope
    // del JWT (BRAND/LEGAL_ENTITY/PROPERTY). Lanza Forbidden con mensaje claro
    // si actor no tiene jurisdicción sobre el target staff.
    await this.scope.assertActorCanEnrollStaff(actor, targetStaffId)

    const course = await this.prisma.learningCourse.findUnique({
      where: { id: dto.courseId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        tier: true,
        organizationId: true,
        contentVersion: true,
        recertificationMonths: true,
      },
    })
    if (!course) throw new NotFoundException(`Course not found: ${dto.courseId}`)
    if (course.status !== 'PUBLISHED') {
      throw new ConflictException(`Course is not enrollable (status=${course.status})`)
    }
    if (course.organizationId && course.organizationId !== orgId) {
      throw new ForbiddenException('Cross-org enrollment not allowed')
    }

    // Self-enroll restringido a CORE/GIFT (PRO/MARKETPLACE/CUSTOM = supervisor)
    if (isSelfEnroll && course.tier !== 'CORE' && course.tier !== 'GIFT') {
      throw new ForbiddenException(
        `Self-enroll solo permitido para cursos CORE/GIFT (este es ${course.tier})`,
      )
    }

    // §multi-tenant: scope ya validó org-level + property-level. Aquí solo
    // necesitamos los datos del staff para enrollment + audit (legalEntity).
    const staff = await this.prisma.staff.findUnique({
      where: { id: targetStaffId },
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        active: true,
        property: { select: { legalEntityId: true } },
      },
    })
    if (!staff) throw new NotFoundException(`Staff not found: ${targetStaffId}`)
    if (!staff.active) throw new ConflictException('Cannot enroll inactive staff')

    // §129: snapshot version
    const contentVersionPin = course.contentVersion

    // Idempotencia: si ya existe enrollment activo en la misma version, devolver
    const existing = await this.prisma.learningEnrollment.findUnique({
      where: {
        staffId_courseId_contentVersionPin: {
          staffId: targetStaffId,
          courseId: course.id,
          contentVersionPin,
        },
      },
    })
    if (existing) {
      if (
        existing.status === 'NOT_STARTED' ||
        existing.status === 'IN_PROGRESS' ||
        existing.status === 'COMPLETED'
      ) {
        return existing
      }
      // CANCELLED o EXPIRED → permitir re-enroll creando fresh row (raro pero valid)
    }

    // Calcular expiresAt si tiene recertificationMonths
    const expiresAt = course.recertificationMonths
      ? new Date(Date.now() + course.recertificationMonths * 30 * 24 * 60 * 60 * 1000)
      : null

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningEnrollment.create({
        data: {
          staffId: targetStaffId,
          courseId: course.id,
          organizationId: orgId,
          // §multi-tenant: legalEntityId habilita el reporting STPS per
          // razón social (la auditoría agrupa por LegalEntity, §64).
          legalEntityId: staff.property.legalEntityId,
          propertyId: staff.propertyId,
          status: LearningEnrollmentStatus.NOT_STARTED,
          enrolledById: isSelfEnroll ? null : actor.sub,
          enrollmentReason: reason,
          expiresAt,
          contentVersionPin,
        },
      })

      // §128 (reservado): audit append-only
      await tx.learningEnrollmentLog.create({
        data: {
          enrollmentId: created.id,
          event: 'ENROLLED',
          metadata: { reason, contentVersionPin, byStaffId: actor.sub },
          actorId: actor.sub,
        },
      })

      return created
    })

    this.logger.log(
      `Enrollment created: staff=${targetStaffId} course=${course.slug} reason=${reason}`,
    )

    // TODO Fase 1.4: emit SSE 'learning:enrollment:created' + push notification welcome
    return enrollment
  }

  /**
   * Marca el enrollment como IN_PROGRESS al abrir la primera lección.
   * Idempotente: si ya está IN_PROGRESS o COMPLETED, no falla.
   */
  async start(enrollmentId: string, actor: JwtPayload) {
    const enrollment = await this.prisma.learningEnrollment.findUnique({
      where: { id: enrollmentId },
    })
    if (!enrollment) throw new NotFoundException(`Enrollment not found: ${enrollmentId}`)
    if (enrollment.staffId !== actor.sub) {
      throw new ForbiddenException('No puedes iniciar el enrollment de otro staff')
    }

    if (enrollment.status === LearningEnrollmentStatus.NOT_STARTED) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.learningEnrollment.update({
          where: { id: enrollmentId },
          data: { status: LearningEnrollmentStatus.IN_PROGRESS, startedAt: new Date() },
        })
        await tx.learningEnrollmentLog.create({
          data: {
            enrollmentId,
            event: 'STARTED',
            actorId: actor.sub,
          },
        })
        return result
      })
      return updated
    }

    return enrollment
  }

  /**
   * Manager view — todos los enrollments dentro del scope del actor.
   * Returns: enrollments agrupados por property + status overdue/upcoming.
   *
   * §multi-tenant 2026-05-21: cubre el caso "admin regional de 2 sucursales
   * ve avances de ambas, admin de cada sucursal solo ve la suya".
   *
   * Scope effective rules:
   *   - PROPERTY scope → solo enrollments con propertyId = actor.propertyId
   *   - LEGAL_ENTITY scope → enrollments con propertyId ∈ properties bajo
   *     actor.legalEntityId (vía AccessControlService.listAccessiblePropertyIds)
   *   - BRAND scope → todas las properties accesibles
   */
  async listForActorScope(
    actor: JwtPayload,
    filters?: { courseId?: string; status?: LearningEnrollmentStatus; overdue?: boolean },
  ) {
    if (actor.role !== StaffRole.SUPERVISOR && actor.level !== 'LEAD') {
      throw new ForbiddenException('Solo supervisor/lead puede ver enrollments del equipo')
    }

    const propertyIds = await this.scope.accessiblePropertyIds(actor)
    if (propertyIds.size === 0) return []

    const where: Prisma.LearningEnrollmentWhereInput = {
      propertyId: { in: [...propertyIds] },
    }
    if (filters?.courseId) where.courseId = filters.courseId
    if (filters?.status) where.status = filters.status
    if (filters?.overdue) {
      where.AND = [
        { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
        { expiresAt: { lt: new Date() } },
      ]
    }

    return this.prisma.learningEnrollment.findMany({
      where,
      include: {
        course: { select: { id: true, slug: true, title: true } },
        staff: { select: { id: true, name: true, email: true } },
        property: { select: { id: true, name: true } },
        certificate: { select: { id: true, serialNumber: true } },
      },
      orderBy: [{ expiresAt: 'asc' }, { status: 'asc' }, { enrolledAt: 'desc' }],
      take: 500,
    })
  }

  async listForStaff(staffId: string, actor: JwtPayload) {
    // §multi-tenant: si es otro staff, validar scope completo (no solo role).
    if (staffId !== actor.sub) {
      const targetStaff = await this.prisma.staff.findUnique({
        where: { id: staffId },
        select: { propertyId: true },
      })
      if (!targetStaff) throw new NotFoundException(`Staff not found: ${staffId}`)
      await this.scope.assertActorCanReadEnrollment(actor, {
        staffId,
        propertyId: targetStaff.propertyId,
      })
    }
    return this.prisma.learningEnrollment.findMany({
      where: { staffId },
      include: {
        course: { select: { id: true, slug: true, title: true, thumbnailUrl: true } },
        certificate: { select: { id: true, serialNumber: true, dc3VerificationUrl: true } },
      },
      orderBy: [{ status: 'asc' }, { enrolledAt: 'desc' }],
    })
  }
}
