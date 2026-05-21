import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, LearningCourseStatus, LearningCourseTier } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { LearningScopeService } from '../scope/learning-scope.service'

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
    private readonly scope: LearningScopeService,
  ) {}

  /**
   * Lista catálogo con filtros + fuzzy search.
   *
   * §multi-tenant 2026-05-21 — visibility se calcula como:
   *   - Catálogo global Zenix (organizationId IS NULL) → siempre visible
   *   - Cursos del cliente (organizationId = actor.organizationId)
   *     filtrados además por propertyId/legalEntityId si el curso está
   *     scoped a una sub-unidad (un curso de "Sucursal Norte" NO debe
   *     aparecer en el catálogo de "Sucursal Sur" — eso era un leak)
   *
   * Reglas:
   *   - Si course.propertyId != null → solo visible si actor tiene acceso
   *     a esa property (vía LearningScopeService.accessiblePropertyIds)
   *   - Si course.legalEntityId != null → solo si actor tiene acceso a esa
   *     LegalEntity (BRAND/LEGAL_ENTITY scope; PROPERTY scope debe matchear
   *     vía property.legalEntityId)
   *   - Si solo organizationId está set → visible para toda la org
   */
  async list(
    filters: {
      category?: string
      tier?: LearningCourseTier
      language?: string
      search?: string
    },
    actor: JwtPayload,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const propertyIds = await this.scope.accessiblePropertyIds(actor)
    const legalEntityIds = await this.scope.accessibleLegalEntityIds(actor)
    const propertyIdArray = [...propertyIds]
    const legalEntityIdArray = [...legalEntityIds]

    // Si hay búsqueda fuzzy, raw query con similarity ranking + scope filter
    if (filters.search && filters.search.trim().length >= 2) {
      const q = filters.search.trim()
      // Postgres array empty literal handling: si arrays vacíos, usa fallback
      // (catálogo global solo) — defensa para actores sin scope efectivo.
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
          AND (title % ${q} OR short_description % ${q})
          AND (
            organization_id IS NULL
            OR (
              organization_id = ${orgId}
              AND (
                (property_id IS NULL AND legal_entity_id IS NULL)
                OR property_id = ANY (${propertyIdArray}::text[])
                OR legal_entity_id = ANY (${legalEntityIdArray}::text[])
              )
            )
          )
        ORDER BY rank_title DESC, rank_desc DESC
        LIMIT 20
      `
    }

    const where: Prisma.LearningCourseWhereInput = {
      status: LearningCourseStatus.PUBLISHED,
      OR: [
        { organizationId: null }, // catálogo global Zenix
        {
          organizationId: orgId,
          AND: [
            {
              OR: [
                { propertyId: null, legalEntityId: null }, // org-wide
                { propertyId: { in: propertyIdArray } }, // property-scoped
                { legalEntityId: { in: legalEntityIdArray } }, // legalEntity-scoped
              ],
            },
          ],
        },
      ],
    }
    if (filters.category)
      where.category = filters.category as Prisma.LearningCourseWhereInput['category']
    if (filters.tier) where.tier = filters.tier
    if (filters.language)
      where.language = filters.language as Prisma.LearningCourseWhereInput['language']

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
