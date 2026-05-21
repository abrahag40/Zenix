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
  ) {}

  async create(dto: CreateEnrollmentDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const propertyId = this.tenant.getPropertyId()

    // Resolver staffId — self-enroll vs admin-assign
    const targetStaffId = dto.staffId ?? actor.sub
    const isSelfEnroll = targetStaffId === actor.sub
    const reason = dto.enrollmentReason ?? (isSelfEnroll ? 'SELF_ENROLL' : 'ASSIGNED_BY_MANAGER')

    if (!isSelfEnroll && actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisor puede asignar cursos a otro staff')
    }

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

    // Verificar que el staff target pertenezca a org/property del actor
    const staff = await this.prisma.staff.findUnique({
      where: { id: targetStaffId },
      select: { id: true, organizationId: true, propertyId: true, active: true },
    })
    if (!staff) throw new NotFoundException(`Staff not found: ${targetStaffId}`)
    if (!staff.active) throw new ConflictException('Cannot enroll inactive staff')
    if (staff.organizationId !== orgId) throw new ForbiddenException('Cross-org staff enrollment')

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

  async listForStaff(staffId: string, actor: JwtPayload) {
    if (staffId !== actor.sub && actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('No autorizado para ver enrollments de otro staff')
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
