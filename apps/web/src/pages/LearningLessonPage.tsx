/**
 * LearningLessonPage.tsx — Sprint LEARNING-CORE Fase 1.1
 *
 * Player de lección + sidebar con tree de módulos/lessons + progress tracking.
 *
 * Route: /learning/lessons/:id
 *
 * Layout (desktop):
 *   ┌────────┬─────────────────────────────────────────────────────────┐
 *   │ ▼ M1   │                                                          │
 *   │  ✓ L1  │   Módulo 4 — Las 16 tareas START                        │
 *   │  ✓ L2  │   Lección 4.3 — Saludo + ID verification                │
 *   │ ▼ M2   │                                                          │
 *   │  ●  L3 │   [LessonPlayer switch by type: HTML5/AUDIO/VIDEO/PDF]  │
 *   │    L4  │                                                          │
 *   │    L5  │   [← Anterior]                  [Marcar visto / →]      │
 *   └────────┴─────────────────────────────────────────────────────────┘
 *
 * Progress tracking:
 *   - timeSpentSeconds acumula via interval cada 5s mientras visible
 *   - bookmarkPosition se reporta en media players
 *   - completed=true al hacer "Marcar como visto" o al >95% media duration
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Award, Circle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '../api/client'
import { learningApi } from '../modules/learning/api/learning.api'
import { useLearningCourse } from '../modules/learning/hooks/useLearning'
import { Html5LessonPlayer } from '../modules/learning/components/LessonPlayer/Html5LessonPlayer'
import {
  AudioLessonPlayer,
  VideoLessonPlayer,
  PdfLessonPlayer,
} from '../modules/learning/components/LessonPlayer/MediaLessonPlayer'
import { AttemptDialog } from '../modules/learning/components/AttemptDialog'

interface LessonFromBackend {
  id: string
  moduleId: string
  order: number
  title: string
  type:
    | 'HTML5_NATIVE'
    | 'VIDEO_MP4'
    | 'AUDIO_MP3'
    | 'PDF_DOCUMENT'
    | 'SCORM_12'
    | 'SCORM_2004'
    | 'XAPI_PACKAGE'
    | 'CMI5_AU'
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

interface ProgressRow {
  id: string
  lessonId: string
  startedAt: string | null
  completedAt: string | null
  timeSpentSeconds: number
  bookmarkPosition: number | null
}

export function LearningLessonPage() {
  const { id: lessonId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [examOpen, setExamOpen] = useState(false)

  const { data: lesson, isLoading: lessonLoading, error: lessonError } = useQuery({
    queryKey: ['learning-lesson', lessonId],
    queryFn: () => learningApi.getLesson(lessonId!) as Promise<LessonFromBackend>,
    enabled: !!lessonId,
  })

  const { data: course } = useLearningCourse(lesson?.module.course.slug)

  const { data: progressList } = useQuery({
    queryKey: ['learning-progress', lesson?.enrollmentId],
    queryFn: () =>
      api.get<ProgressRow[]>(
        `/api/v1/learning/enrollments/${lesson!.enrollmentId}/progress`,
      ),
    enabled: !!lesson?.enrollmentId,
  })

  const progressByLesson = useMemo(() => {
    const map = new Map<string, ProgressRow>()
    progressList?.forEach((p) => map.set(p.lessonId, p))
    return map
  }, [progressList])

  // Tracking de tiempo en pantalla — interval cada 5s mientras el tab está visible
  const timeSpentSinceLast = useRef(0)
  const lastTickRef = useRef(Date.now())

  useEffect(() => {
    if (!lesson) return
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      const delta = Math.floor((now - lastTickRef.current) / 1000)
      lastTickRef.current = now
      timeSpentSinceLast.current += delta

      // Flush cada 30s
      if (timeSpentSinceLast.current >= 30) {
        void flushProgress({ timeSpentDeltaSeconds: timeSpentSinceLast.current })
        timeSpentSinceLast.current = 0
      }
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id, lesson?.enrollmentId])

  // Flush al desmontar / cambio de lección
  useEffect(() => {
    return () => {
      if (timeSpentSinceLast.current > 0 && lesson) {
        void flushProgress({ timeSpentDeltaSeconds: timeSpentSinceLast.current })
        timeSpentSinceLast.current = 0
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  const flushProgress = useCallback(
    async (update: { timeSpentDeltaSeconds?: number; bookmarkPosition?: number; completed?: boolean }) => {
      if (!lesson) return
      try {
        await learningApi.trackProgress(lesson.id, {
          enrollmentId: lesson.enrollmentId,
          ...update,
        })
        await qc.invalidateQueries({ queryKey: ['learning-progress', lesson.enrollmentId] })
      } catch (err) {
        // Fail-soft — el progress no debe romper la sesión del learner
        console.error('Progress track failed:', (err as Error).message)
      }
    },
    [lesson, qc],
  )

  const handleMarkComplete = async () => {
    await flushProgress({ completed: true })
    navigateNext()
  }

  const allLessons = useMemo(() => {
    if (!course) return []
    return course.modules.flatMap((m) =>
      m.lessons.map((l) => ({ ...l, moduleOrder: m.order, moduleTitle: m.title })),
    )
  }, [course])

  const currentIdx = lesson ? allLessons.findIndex((l) => l.id === lesson.id) : -1
  const hasNext = currentIdx >= 0 && currentIdx < allLessons.length - 1
  const hasPrev = currentIdx > 0
  const allLessonsCompleted = allLessons
    .filter((l) => !l.isOptional)
    .every((l) => progressByLesson.get(l.id)?.completedAt)

  const navigateNext = () => {
    if (hasNext) {
      navigate(`/learning/lessons/${allLessons[currentIdx + 1].id}`)
    } else if (course && allLessonsCompleted && course.assessment) {
      // Lección final completada → ofrecer examen
      setExamOpen(true)
    } else if (course) {
      navigate(`/learning/courses/${course.slug}`)
    }
  }
  const navigatePrev = () => {
    if (hasPrev) navigate(`/learning/lessons/${allLessons[currentIdx - 1].id}`)
  }

  if (lessonLoading) return <LessonPageSkeleton />

  if (lessonError) {
    const err = lessonError as ApiError
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Button variant="outline" onClick={() => navigate('/learning')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {err.status === 403
            ? 'No tienes un enrollment activo para este curso. Inscríbete primero.'
            : `Error: ${err.message}`}
        </div>
      </div>
    )
  }

  if (!lesson || !course) return null

  const currentProgress = progressByLesson.get(lesson.id)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/learning/courses/${course.slug}`)}
            className="mb-4 w-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> {course.title}
          </Button>
          <CourseTree
            modules={course.modules}
            currentLessonId={lesson.id}
            progressByLesson={progressByLesson}
            onSelect={(id) => navigate(`/learning/lessons/${id}`)}
          />
          {allLessonsCompleted && course.assessment && (
            <Button
              className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setExamOpen(true)}
            >
              <Award className="mr-2 h-4 w-4" />
              Tomar examen final
            </Button>
          )}
        </aside>

        {/* Main content */}
        <main>
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
            <span>Módulo {lesson.module.order}. {lesson.module.title}</span>
            <span>·</span>
            <span>Lección {lesson.order}</span>
            <Badge variant="outline" className="ml-auto">{lesson.durationMinutes}m</Badge>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{lesson.title}</h1>

          <div className="mt-6">
            <LessonPlayerSwitch
              lesson={lesson}
              initialBookmarkPosition={currentProgress?.bookmarkPosition ?? undefined}
              onProgressTick={(pos, completed) =>
                flushProgress({
                  bookmarkPosition: Math.floor(pos),
                  completed: completed ? true : undefined,
                })
              }
            />
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={navigatePrev} disabled={!hasPrev}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
            </Button>
            <div className="flex items-center gap-2">
              {currentProgress?.completedAt ? (
                <Badge className="bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Completada
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => flushProgress({ completed: true })}
                >
                  Marcar como vista
                </Button>
              )}
              <Button onClick={handleMarkComplete} className="bg-emerald-600 hover:bg-emerald-700">
                Siguiente <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>

      {course.assessment && (
        <AttemptDialog
          open={examOpen}
          onOpenChange={setExamOpen}
          enrollmentId={lesson.enrollmentId}
          passingScore={course.passingScore}
          durationMinutes={course.assessment.durationMinutes}
          onCompleted={() => {
            void qc.invalidateQueries({ queryKey: ['learning-progress'] })
            void qc.invalidateQueries({ queryKey: ['learning-enrollments'] })
            void qc.invalidateQueries({ queryKey: ['learning-dashboard'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function LessonPlayerSwitch(props: {
  lesson: LessonFromBackend
  initialBookmarkPosition?: number
  onProgressTick: (pos: number, completed: boolean) => void
}) {
  const { lesson } = props
  switch (lesson.type) {
    case 'HTML5_NATIVE':
      return (
        <Html5LessonPlayer
          contentJson={lesson.contentJson as Parameters<typeof Html5LessonPlayer>[0]['contentJson']}
        />
      )
    case 'AUDIO_MP3':
      return lesson.audioUrl ? (
        <AudioLessonPlayer
          url={lesson.audioUrl}
          transcriptText={lesson.transcriptText}
          initialBookmarkPosition={props.initialBookmarkPosition}
          onProgressTick={props.onProgressTick}
        />
      ) : (
        <EmptyMedia label="audio" />
      )
    case 'VIDEO_MP4':
      return lesson.videoUrl ? (
        <VideoLessonPlayer
          url={lesson.videoUrl}
          transcriptText={lesson.transcriptText}
          initialBookmarkPosition={props.initialBookmarkPosition}
          onProgressTick={props.onProgressTick}
        />
      ) : (
        <EmptyMedia label="video" />
      )
    case 'PDF_DOCUMENT':
      return lesson.pdfUrl ? (
        <PdfLessonPlayer
          url={lesson.pdfUrl}
          onProgressTick={props.onProgressTick}
        />
      ) : (
        <EmptyMedia label="PDF" />
      )
    case 'SCORM_12':
    case 'SCORM_2004':
    case 'XAPI_PACKAGE':
    case 'CMI5_AU':
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Este tipo de lección ({lesson.type}) requiere Zenix Learning Pro — disponible Fase 2.
        </div>
      )
    default:
      return null
  }
}

function CourseTree(props: {
  modules: { id: string; order: number; title: string; lessons: { id: string; order: number; title: string; durationMinutes: number; isOptional: boolean }[] }[]
  currentLessonId: string
  progressByLesson: Map<string, ProgressRow>
  onSelect: (lessonId: string) => void
}) {
  return (
    <nav className="space-y-3">
      {props.modules.map((m) => (
        <div key={m.id} className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Módulo {m.order}
            </p>
            <p className="text-sm font-medium text-slate-900">{m.title}</p>
          </div>
          <ul className="p-1">
            {m.lessons.map((l) => {
              const isActive = l.id === props.currentLessonId
              const isDone = !!props.progressByLesson.get(l.id)?.completedAt
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(l.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      isActive
                        ? 'bg-emerald-50 font-medium text-emerald-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                    ) : isActive ? (
                      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-pulse text-emerald-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
                    )}
                    <span className="flex-1 truncate">{l.title}</span>
                    <span className="text-xs text-slate-400">{l.durationMinutes}m</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function EmptyMedia({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
      Esta lección no tiene {label} cargado.
    </div>
  )
}

function LessonPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="mt-3 h-9 w-2/3" />
      <Skeleton className="mt-6 h-96 w-full" />
    </div>
  )
}
