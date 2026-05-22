/**
 * Learning API client — mobile. Wraps src/api/client.ts (§122 paridad web).
 * Mismo shape que apps/web/src/modules/learning/api/learning.api.ts pero
 * tipos duplicados (Fase 1.5 mover a packages/shared).
 */
import { api } from '../../../api/client'

// ─── Enums (duplicados desde Prisma — mover a @zenix/shared en Fase 1.5) ─

export type LearningCourseTier = 'CORE' | 'PRO' | 'MARKETPLACE' | 'CUSTOM' | 'GIFT'
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

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface LearningCourseCard {
  id: string
  slug: string
  title: string
  shortDescription: string
  category: LearningCourseCategory
  tier: LearningCourseTier
  language: string
  status: LearningCourseStatus
  contentVersion: string
  estimatedHours: string
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

export interface LessonDetail {
  id: string
  moduleId: string
  order: number
  title: string
  type: LearningLessonType
  durationMinutes: number
  contentJson: unknown
  audioUrl: string | null
  videoUrl: string | null
  pdfUrl: string | null
  transcriptText: string | null
  module: {
    id: string
    title: string
    order: number
    courseId: string
    course: { id: string; slug: string; title: string }
  }
  enrollmentId: string
}

export interface ProgressRow {
  id: string
  lessonId: string
  startedAt: string | null
  completedAt: string | null
  timeSpentSeconds: number
  bookmarkPosition: number | null
}

export interface TenantDLC {
  id: string
  organizationId: string
  dlcCode: DLCCode
  status: DLCStatus
  scopedPropertyIds: string[]
}

export interface AttemptStarted {
  attemptId: string
  questionsTotal: number
  questions: Array<{ id: string; q: string; options: string[] }>
  startedAt: string
}

export interface AttemptResult {
  attemptId: string
  scorePct: number
  questionsCorrect: number
  questionsTotal: number
  passed: boolean
  result: 'PASSED' | 'FAILED'
}

// ─── API methods ──────────────────────────────────────────────────────────

export const learningApi = {
  listCourses: (params?: { category?: string; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.category) qs.set('category', params.category)
    if (params?.search) qs.set('search', params.search)
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<LearningCourseCard[]>(`/api/v1/learning/courses${suffix}`)
  },

  getCourseBySlug: (slug: string) =>
    api.get<LearningCourseDetail>(`/api/v1/learning/courses/${slug}`),

  getDashboard: () =>
    api.get<LearningDashboard>(`/api/v1/learning/me/dashboard`),

  createEnrollment: (courseId: string) =>
    api.post<LearningEnrollmentSummary>(`/api/v1/learning/enrollments`, { courseId }),

  startEnrollment: (enrollmentId: string) =>
    api.patch<LearningEnrollmentSummary>(
      `/api/v1/learning/enrollments/${enrollmentId}/start`,
    ),

  listMyEnrollments: () =>
    api.get<LearningEnrollmentSummary[]>(`/api/v1/learning/enrollments`),

  getLesson: (lessonId: string) =>
    api.get<LessonDetail>(`/api/v1/learning/lessons/${lessonId}`),

  trackProgress: (
    lessonId: string,
    input: {
      enrollmentId: string
      bookmarkPosition?: number
      timeSpentDeltaSeconds?: number
      completed?: boolean
    },
  ) => api.post(`/api/v1/learning/lessons/${lessonId}/progress`, input),

  listEnrollmentProgress: (enrollmentId: string) =>
    api.get<ProgressRow[]>(`/api/v1/learning/enrollments/${enrollmentId}/progress`),

  startAttempt: (input: { enrollmentId: string; lessonId?: string }) =>
    api.post<AttemptStarted>(`/api/v1/learning/attempts`, input),

  submitAttempt: (
    attemptId: string,
    answers: Array<{ questionId: string; selectedOptionIdx: number | number[] }>,
  ) =>
    api.post<AttemptResult>(`/api/v1/learning/attempts/${attemptId}/submit`, { answers }),
}

export const dlcApi = {
  listMine: () => api.get<TenantDLC[]>('/api/v1/dlc'),
  getOne: (dlcCode: DLCCode) => api.get<TenantDLC | null>(`/api/v1/dlc/${dlcCode}`),
}
