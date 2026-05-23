/**
 * useLearning.ts — React Query hooks Learning mobile.
 * Paridad con apps/web/src/modules/learning/hooks/useLearning.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { learningApi } from '../api/learning.api'

const KEY_COURSES = 'learning-courses'
const KEY_COURSE = 'learning-course'
const KEY_DASHBOARD = 'learning-dashboard'
const KEY_ENROLLMENTS = 'learning-enrollments'
const KEY_LESSON = 'learning-lesson'
const KEY_PROGRESS = 'learning-progress'

export function useLearningDashboard() {
  return useQuery({
    queryKey: [KEY_DASHBOARD],
    queryFn: () => learningApi.getDashboard(),
    staleTime: 60_000,
  })
}

export function useLearningCourses(filters?: { category?: string; search?: string }) {
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

export function useMyEnrollments() {
  return useQuery({
    queryKey: [KEY_ENROLLMENTS, 'me'],
    queryFn: () => learningApi.listMyEnrollments(),
    staleTime: 60_000,
  })
}

export function useCreateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courseId: string) => learningApi.createEnrollment(courseId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [KEY_DASHBOARD] })
      await qc.invalidateQueries({ queryKey: [KEY_ENROLLMENTS] })
    },
  })
}

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: [KEY_LESSON, lessonId],
    queryFn: () => learningApi.getLesson(lessonId!),
    enabled: !!lessonId,
  })
}

export function useEnrollmentProgress(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: [KEY_PROGRESS, enrollmentId],
    queryFn: () => learningApi.listEnrollmentProgress(enrollmentId!),
    enabled: !!enrollmentId,
    staleTime: 30_000,
  })
}

export function useTrackProgress(lessonId: string, enrollmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      bookmarkPosition?: number
      timeSpentDeltaSeconds?: number
      completed?: boolean
    }) => learningApi.trackProgress(lessonId, { ...input, enrollmentId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY_PROGRESS, enrollmentId] })
    },
  })
}
