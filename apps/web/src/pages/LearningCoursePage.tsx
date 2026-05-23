/**
 * LearningCoursePage.tsx — Sprint LEARNING-CORE Fase 1.1
 *
 * Detalle de un curso: módulos + lessons + start CTA + assessment info.
 * Player de lección (HTML5/audio/video/PDF switch) llega en Fase 1.2.
 *
 * Route: /learning/courses/:slug
 */
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Clock, Award, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useLearningCourse,
  useCreateEnrollment,
  useMyEnrollments,
} from '../modules/learning/hooks/useLearning'

export function LearningCoursePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data: course, isLoading, error } = useLearningCourse(slug)
  const { data: myEnrollments } = useMyEnrollments()
  const enrollMut = useCreateEnrollment()

  if (isLoading) return <CoursePageSkeleton />
  if (error || !course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Button variant="outline" onClick={() => navigate('/learning')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudo cargar el curso: {(error as Error)?.message ?? 'Curso no encontrado'}
        </div>
      </div>
    )
  }

  const myEnrollment = myEnrollments?.find(
    (e) => e.courseId === course.id && e.status !== 'CANCELLED',
  )
  const isEnrolled = !!myEnrollment && myEnrollment.status !== 'EXPIRED'
  const isCompleted = myEnrollment?.status === 'COMPLETED'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/learning?tab=catalog')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al catálogo
        </Button>

        {/* Header */}
        <header className="mt-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{course.tier}</Badge>
            <Badge variant="outline">{course.category}</Badge>
            <Badge variant="outline">v{course.contentVersion}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">{course.title}</h1>
          <p className="mt-2 text-base text-slate-600">{course.shortDescription}</p>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> ~{course.estimatedHours} hrs
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> {course.modules.length} módulos
            </span>
            {course.recertificationMonths && (
              <span className="flex items-center gap-1.5">
                <Award className="h-4 w-4" /> Recertificación cada {course.recertificationMonths}m
              </span>
            )}
          </div>

          {/* CTA */}
          <div className="mt-6">
            {isCompleted ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">
                  ✓ Completado{' '}
                  {myEnrollment?.completedAt &&
                    new Date(myEnrollment.completedAt).toLocaleDateString('es-MX')}
                </p>
                {myEnrollment?.certificate && (
                  <a
                    href={myEnrollment.certificate.dc3VerificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-emerald-700 underline"
                  >
                    Ver certificado #{myEnrollment.certificate.serialNumber}
                  </a>
                )}
              </div>
            ) : isEnrolled ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const firstLesson = course.modules[0]?.lessons[0]
                  if (firstLesson) {
                    navigate(`/learning/lessons/${firstLesson.id}`)
                  }
                }}
              >
                <Play className="mr-2 h-4 w-4" />
                {myEnrollment?.status === 'IN_PROGRESS' ? 'Continuar' : 'Empezar curso'}
              </Button>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={enrollMut.isPending}
                onClick={() => enrollMut.mutate({ courseId: course.id })}
              >
                {enrollMut.isPending ? 'Inscribiendo…' : 'Inscribirme'}
              </Button>
            )}
          </div>
        </header>

        {/* Long description */}
        {course.longDescription && (
          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
              Acerca del curso
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {course.longDescription}
            </p>
          </section>
        )}

        {/* Modules + Lessons */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-600">
            Contenido — {course.modules.length} módulos
          </h2>
          <div className="space-y-3">
            {course.modules.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-900">
                    Módulo {m.order}. {m.title}
                  </h3>
                  <span className="text-xs text-slate-500">~{m.estimatedMinutes}m</span>
                </div>
                {m.description && (
                  <p className="mt-1 text-xs text-slate-600">{m.description}</p>
                )}
                <ul className="mt-3 space-y-1.5">
                  {m.lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between text-sm text-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                        {l.title}
                      </span>
                      <span className="text-xs text-slate-500">{l.durationMinutes}m</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Assessment */}
        {course.assessment && (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
              Examen final
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li>{course.assessment.questionsPerAttempt} preguntas</li>
              <li>{course.assessment.durationMinutes} minutos</li>
              <li>Aprobación: {course.passingScore}%</li>
              <li>Intentos disponibles: {course.maxAttempts}</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function CoursePageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="mt-6 h-10 w-3/4" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="mt-6 h-12 w-40" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}
