/**
 * Learning API client — wraps the Zenix HTTP client (§122) for the learning
 * module. NO raw fetch. Timeouts + 401 redirect + error shape vienen del cliente.
 *
 * Endpoints implementados (apps/api/src/learning/):
 *   GET    /v1/learning/courses                 — catálogo con fuzzy search
 *   GET    /v1/learning/courses/:slug           — detalle + módulos + lessons
 *   GET    /v1/learning/me/dashboard            — Continue + Due + Assigned
 *   POST   /v1/learning/enrollments             — self-enroll o manager assign
 *   PATCH  /v1/learning/enrollments/:id/start   — marcar IN_PROGRESS
 *   GET    /v1/learning/enrollments             — mis enrollments
 *   GET    /v1/learning/manager/enrollments     — scope BRAND/LE/PROPERTY (manager)
 *   GET    /v1/learning/lessons/:id             — render lesson con auth check
 *   POST   /v1/learning/lessons/:id/progress    — track progress + bookmark
 *   POST   /v1/learning/attempts                — iniciar quiz/examen
 *   POST   /v1/learning/attempts/:id/submit     — submit respuestas + scoring
 *   GET    /v1/learning/certificates/:serial    — verify público (no auth)
 */
import { api } from '../../../api/client'

// ─── Types — alineados con backend Prisma models ──────────────────────────
// (En Fase 1.5 estos types se moverán a packages/shared/ — ver §16 doc plan.)

export type LearningCourseTier =
  | 'CORE'
  | 'PRO'
  | 'MARKETPLACE'
  | 'CUSTOM'
  | 'GIFT'

export type LearningCourseStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'

export type LearningEnrollmentStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'

export type LearningLessonType =
  | 'HTML5_NATIVE'
  | 'VIDEO_MP4'
  | 'AUDIO_MP3'
  | 'PDF_DOCUMENT'
  | 'SCORM_12'
  | 'SCORM_2004'
  | 'XAPI_PACKAGE'
  | 'CMI5_AU'

export type LearningContentLanguage = 'ES_MX' | 'ES_419' | 'EN_US' | 'PT_BR'

export type LearningCourseCategory =
  | 'COMPLIANCE_LEGAL'
  | 'COMPLIANCE_SANITATION'
  | 'FRONT_OFFICE'
  | 'HOUSEKEEPING'
  | 'FOOD_BEVERAGE'
  | 'REVENUE_MANAGEMENT'
  | 'LEADERSHIP'
  | 'SAFETY_SECURITY'
  | 'GUEST_SERVICE'
  | 'TECHNOLOGY'

export interface LearningCourseCard {
  id: string
  slug: string
  title: string
  shortDescription: string
  category: LearningCourseCategory
  tier: LearningCourseTier
  language: LearningContentLanguage
  status: LearningCourseStatus
  contentVersion: string
  estimatedHours: string // Decimal serialized
  certificateType: string
  thumbnailUrl: string | null
}

export interface LearningLessonSummary {
  id: string
  order: number
  title: string
  type: LearningLessonType
  durationMinutes: number
  isOptional: boolean
}

export interface LearningModuleDetail {
  id: string
  order: number
  title: string
  description: string | null
  estimatedMinutes: number
  lessons: LearningLessonSummary[]
}

export interface LearningCourseDetail extends LearningCourseCard {
  longDescription: string | null
  bloomLevels: string[]
  prerequisites: string[]
  passingScore: string
  maxAttempts: number
  retakeWaitHours: number
  recertificationMonths: number | null
  modules: LearningModuleDetail[]
  assessment: {
    id: string
    questionsPerAttempt: number
    durationMinutes: number
  } | null
}

export interface LearningEnrollmentSummary {
  id: string
  staffId: string
  courseId: string
  status: LearningEnrollmentStatus
  enrolledAt: string
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  finalScore: string | null
  attemptsUsed: number
  enrollmentReason: string | null
  course: {
    id: string
    slug: string
    title: string
    category?: LearningCourseCategory
    thumbnailUrl: string | null
    estimatedHours?: string
    recertificationMonths?: number | null
  }
  certificate?: {
    id: string
    serialNumber: string
    dc3VerificationUrl: string
  } | null
}

export interface LearningDashboard {
  continueLearning: LearningEnrollmentSummary | null
  dueSoon: LearningEnrollmentSummary[]
  assigned: LearningEnrollmentSummary[]
  recommended: LearningEnrollmentSummary[]
}

export interface CreateEnrollmentInput {
  courseId: string
  staffId?: string
  enrollmentReason?:
    | 'SELF_ENROLL'
    | 'ASSIGNED_BY_MANAGER'
    | 'ASSIGNMENT_RULE'
    | 'GIFT_AT_ACTIVATION'
    | 'RECERTIFICATION'
}

// ─── DLC types ────────────────────────────────────────────────────────────

export type DLCCode =
  | 'LEARNING_CORE'
  | 'LEARNING_PRO'
  | 'LEARNING_GIFT'
  | 'BOOKING_ENGINE'
  | 'POS'
  | 'PROCURE'
  | 'STAY_ACCESS'
  | 'PEOPLE'
  | 'BOOKS'

export type DLCStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'GRACE_PERIOD'
  | 'ARCHIVED'
  | 'PURGED'

export type DLCBillingMode =
  | 'ONE_TIME_GIFT'
  | 'FLAT_MONTHLY'
  | 'PER_STAFF_ACTIVE'
  | 'PER_TRANSACTION'

export interface TenantDLC {
  id: string
  organizationId: string
  dlcCode: DLCCode
  status: DLCStatus
  billingMode: DLCBillingMode
  pricePerUnit: string | null
  activatedAt: string
  suspendedAt: string | null
  gracePeriodEndsAt: string | null
  archivedAt: string | null
  reactivatedAt: string | null
  scopedPropertyIds: string[]
  suspensionReason: string | null
  cancellationReason: string | null
  metadata: Record<string, unknown> | null
}

// ─── API methods ──────────────────────────────────────────────────────────

export const learningApi = {
  // Catalog
  listCourses: (params?: {
    category?: string
    tier?: LearningCourseTier
    language?: string
    search?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.category) qs.set('category', params.category)
    if (params?.tier) qs.set('tier', params.tier)
    if (params?.language) qs.set('language', params.language)
    if (params?.search) qs.set('search', params.search)
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<LearningCourseCard[]>(`/api/v1/learning/courses${suffix}`)
  },

  getCourseBySlug: (slug: string) =>
    api.get<LearningCourseDetail>(`/api/v1/learning/courses/${slug}`),

  getDashboard: () =>
    api.get<LearningDashboard>(`/api/v1/learning/me/dashboard`),

  // Enrollments
  createEnrollment: (input: CreateEnrollmentInput) =>
    api.post<LearningEnrollmentSummary>(`/api/v1/learning/enrollments`, input),

  startEnrollment: (enrollmentId: string) =>
    api.patch<LearningEnrollmentSummary>(
      `/api/v1/learning/enrollments/${enrollmentId}/start`,
    ),

  listEnrollments: (staffId?: string) => {
    const qs = staffId ? `?staffId=${staffId}` : ''
    return api.get<LearningEnrollmentSummary[]>(`/api/v1/learning/enrollments${qs}`)
  },

  listManagerScope: (params?: { courseId?: string; overdue?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.courseId) qs.set('courseId', params.courseId)
    if (params?.overdue) qs.set('overdue', 'true')
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<LearningEnrollmentSummary[]>(
      `/api/v1/learning/manager/enrollments${suffix}`,
    )
  },

  // Lessons
  getLesson: (lessonId: string) =>
    api.get(`/api/v1/learning/lessons/${lessonId}`),

  trackProgress: (
    lessonId: string,
    input: {
      enrollmentId: string
      bookmarkPosition?: number
      timeSpentDeltaSeconds?: number
      completed?: boolean
    },
  ) => api.post(`/api/v1/learning/lessons/${lessonId}/progress`, input),

  // Attempts
  startAttempt: (input: { enrollmentId: string; lessonId?: string }) =>
    api.post(`/api/v1/learning/attempts`, input),

  submitAttempt: (
    attemptId: string,
    answers: Array<{ questionId: string; selectedOptionIdx: number | number[] }>,
  ) =>
    api.post(`/api/v1/learning/attempts/${attemptId}/submit`, { answers }),
}

// ─── DLC API methods ──────────────────────────────────────────────────────

export const dlcApi = {
  listMine: () => api.get<TenantDLC[]>('/api/v1/dlc'),

  getOne: (dlcCode: DLCCode) => api.get<TenantDLC | null>(`/api/v1/dlc/${dlcCode}`),

  activate: (input: {
    dlcCode: DLCCode
    billingMode: DLCBillingMode
    pricePerUnit?: number
    metadata?: Record<string, unknown>
    scopedPropertyIds?: string[]
  }) => api.post<TenantDLC>('/api/v1/dlc/activate', input),

  cancel: (dlcCode: DLCCode, reason: string) =>
    api.post<TenantDLC>(`/api/v1/dlc/${dlcCode}/cancel`, { reason }),
}
