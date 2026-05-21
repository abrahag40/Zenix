import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, LearningCourseStatus, LearningCourseTier } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

/**
 * CatalogService — listing + fuzzy search del catálogo.
 *
 * Fuzzy search vía PostgreSQL pg_trgm (extension activada en migration
 * 20260521120000_learning_core_init). Top complaint #1 LMS según doc 03 §5
 * resuelto con índices GIN trigram en title + short_description.
 *
 * Scope de visibilidad:
 *   - Cursos PUBLISHED del catálogo global Zenix (organizationId = null)
 *   - Cursos PUBLISHED del cliente (organizationId/legalEntityId/propertyId
 *     coinciden con el actor scope)
 *   - Tier según DLC activo del cliente (CORE siempre; PRO si L2 activo;
 *     MARKETPLACE solo cursos comprados; GIFT siempre visible)
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Lista catálogo con filtros + fuzzy search.
   * TODO Fase 1.1: agregar query param `dueSoon=true` que cruce con
   * LearningEnrollment del actor para resaltar lo que vence en 30 días.
   */
  async list(filters: {
    category?: string
    tier?: LearningCourseTier
    language?: string
    search?: string
  }) {
    const orgId = this.tenant.getOrganizationId()

    // Si hay búsqueda fuzzy, usar raw query con similarity ranking
    if (filters.search && filters.search.trim().length >= 2) {
      const q = filters.search.trim()
      return this.prisma.$queryRaw<Array<unknown>>`
        SELECT
          id, slug, title, short_description as "shortDescription",
          category, tier, language, status, content_version as "contentVersion",
          estimated_hours as "estimatedHours", certificate_type as "certificateType",
          thumbnail_url as "thumbnailUrl",
          similarity(title, ${q})::float AS rank_title,
          similarity(short_description, ${q})::float AS rank_desc
        FROM learning_courses
        WHERE status = 'PUBLISHED'
          AND (organization_id IS NULL OR organization_id = ${orgId})
          AND (title % ${q} OR short_description % ${q})
        ORDER BY rank_title DESC, rank_desc DESC
        LIMIT 20
      `
    }

    const where: Prisma.LearningCourseWhereInput = {
      status: LearningCourseStatus.PUBLISHED,
      OR: [
        { organizationId: null }, // catálogo global Zenix
        { organizationId: orgId }, // cursos del cliente
      ],
    }
    if (filters.category) where.category = filters.category as Prisma.LearningCourseWhereInput['category']
    if (filters.tier) where.tier = filters.tier
    if (filters.language) where.language = filters.language as Prisma.LearningCourseWhereInput['language']

    return this.prisma.learningCourse.findMany({
      where,
      orderBy: [{ tier: 'asc' }, { title: 'asc' }],
      take: 100,
    })
  }

  async findBySlug(slug: string) {
    const course = await this.prisma.learningCourse.findUnique({
      where: { slug },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                order: true,
                title: true,
                type: true,
                durationMinutes: true,
                isOptional: true,
              },
            },
          },
        },
        assessment: {
          select: { id: true, questionsPerAttempt: true, durationMinutes: true },
        },
      },
    })
    if (!course) throw new NotFoundException(`Course not found: ${slug}`)
    return course
  }

  /**
   * Dashboard learner: Continue + Due Soon + Assigned + Recommended.
   * TODO Fase 1.1: implementar lógica de recommended basada en role + history.
   */
  async getDashboardForActor(actor: JwtPayload) {
    const staffId = actor.sub

    const enrollments = await this.prisma.learningEnrollment.findMany({
      where: { staffId },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            category: true,
            thumbnailUrl: true,
            estimatedHours: true,
            recertificationMonths: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { enrolledAt: 'desc' }],
    })

    const inProgress = enrollments.filter((e) => e.status === 'IN_PROGRESS')
    const notStarted = enrollments.filter((e) => e.status === 'NOT_STARTED')
    const now = new Date()
    const dueSoonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 días
    const dueSoon = enrollments.filter(
      (e) => e.status !== 'COMPLETED' && e.expiresAt && e.expiresAt > now && e.expiresAt < dueSoonThreshold,
    )

    return {
      continueLearning: inProgress[0] ?? null,
      dueSoon,
      assigned: notStarted.filter((e) => e.enrollmentReason !== 'SELF_ENROLL'),
      // TODO Fase 1.1: recommended engine
      recommended: [],
    }
  }
}
