/**
 * useLearning.ts — hooks React Query del módulo Learning.
 *
 * Convención de query keys (paridad con módulos existentes):
 *   ['learning-courses', filters]    — listado de catálogo
 *   ['learning-course', slug]        — detalle de curso
 *   ['learning-dashboard']           — dashboard learner
 *   ['learning-enrollments', staffId] — mis enrollments
 *   ['learning-manager-enrollments', filters] — vista manager scope
 *   ['dlcs']                         — lista de DLCs del tenant
 *   ['dlc', dlcCode]                 — un DLC específico
 *
 * staleTime 2-5 min — el catálogo cambia raro; el dashboard se invalida via
 * SSE cuando hay events `learning:*`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  dlcApi,
  learningApi,
  type CreateEnrollmentInput,
  type DLCBillingMode,
  type DLCCode,
  type LearningCourseTier,
} from '../api/learning.api'

const KEY_COURSES = 'learning-courses'
const KEY_COURSE = 'learning-course'
const KEY_DASHBOARD = 'learning-dashboard'
const KEY_ENROLLMENTS = 'learning-enrollments'
const KEY_MANAGER_ENROLLMENTS = 'learning-manager-enrollments'
const KEY_DLCS = 'dlcs'
const KEY_DLC = 'dlc'

// ─── Catalog ──────────────────────────────────────────────────────────────

export function useLearningCourses(filters?: {
  category?: string
  tier?: LearningCourseTier
  language?: string
  search?: string
}) {
  return useQuery({
    queryKey: [KEY_COURSES, filters],
    queryFn: () => learningApi.listCourses(filters),
    staleTime: 2 * 60 * 1000,
  })
}

export function useLearningCourse(slug: string | undefined) {
  return useQuery({
    queryKey: [KEY_COURSE, slug],
    queryFn: () => learningApi.getCourseBySlug(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export function useLearningDashboard() {
  return useQuery({
    queryKey: [KEY_DASHBOARD],
    queryFn: () => learningApi.getDashboard(),
    staleTime: 60 * 1000,
  })
}

// ─── Enrollments ──────────────────────────────────────────────────────────

export function useMyEnrollments() {
  return useQuery({
    queryKey: [KEY_ENROLLMENTS, 'me'],
    queryFn: () => learningApi.listEnrollments(),
    staleTime: 60 * 1000,
  })
}

export function useManagerEnrollments(filters?: {
  courseId?: string
  overdue?: boolean
}) {
  return useQuery({
    queryKey: [KEY_MANAGER_ENROLLMENTS, filters],
    queryFn: () => learningApi.listManagerScope(filters),
    staleTime: 60 * 1000,
  })
}

export function useCreateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) => learningApi.createEnrollment(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [KEY_DASHBOARD] })
      await qc.invalidateQueries({ queryKey: [KEY_ENROLLMENTS] })
      await qc.invalidateQueries({ queryKey: [KEY_MANAGER_ENROLLMENTS] })
      toast.success('Inscrito al curso')
    },
    onError: (err: Error & { code?: string; status?: number }) => {
      if (err.status === 402 && err.code) {
        // DLC not active — mostrar accionable
        toast.error('Necesitas activar Zenix Learning antes. Redirigiendo a Settings...')
      } else {
        toast.error(`No se pudo inscribir: ${err.message}`)
      }
    },
  })
}

export function useStartEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enrollmentId: string) => learningApi.startEnrollment(enrollmentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [KEY_DASHBOARD] })
      await qc.invalidateQueries({ queryKey: [KEY_ENROLLMENTS] })
    },
  })
}

// ─── DLC ──────────────────────────────────────────────────────────────────

export function useDLCs() {
  return useQuery({
    queryKey: [KEY_DLCS],
    queryFn: () => dlcApi.listMine(),
    staleTime: 60 * 1000,
  })
}

export function useDLC(dlcCode: DLCCode | undefined) {
  return useQuery({
    queryKey: [KEY_DLC, dlcCode],
    queryFn: () => dlcApi.getOne(dlcCode!),
    enabled: !!dlcCode,
    staleTime: 60 * 1000,
  })
}

export function useActivateDLC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      dlcCode: DLCCode
      billingMode: DLCBillingMode
      pricePerUnit?: number
      metadata?: Record<string, unknown>
      scopedPropertyIds?: string[]
    }) => dlcApi.activate(input),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: [KEY_DLCS] })
      await qc.invalidateQueries({ queryKey: [KEY_DLC, data.dlcCode] })
      // Refresh learning queries — endpoints ahora retornarán 200 en vez de 402
      await qc.invalidateQueries({ queryKey: [KEY_DASHBOARD] })
      await qc.invalidateQueries({ queryKey: [KEY_COURSES] })
      toast.success(`Add-On ${data.dlcCode} activado`)
    },
    onError: (err: Error) => {
      toast.error(`No se pudo activar: ${err.message}`)
    },
  })
}

export function useCancelDLC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dlcCode, reason }: { dlcCode: DLCCode; reason: string }) =>
      dlcApi.cancel(dlcCode, reason),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: [KEY_DLCS] })
      await qc.invalidateQueries({ queryKey: [KEY_DLC, data.dlcCode] })
      toast.success(
        `Add-On ${data.dlcCode} cancelado. Tu data se preserva — puedes reactivarlo cuando quieras.`,
      )
    },
    onError: (err: Error) => {
      toast.error(`No se pudo cancelar: ${err.message}`)
    },
  })
}
