/**
 * Aprende/lesson/[id] — Lesson player mobile con switch por type.
 *
 * Tracking pattern:
 *   - Interval 5s mientras app activa (no en background — RN convention)
 *   - Audio: el AudioLessonPlayer dispara onProgressTick desde sync interval
 *   - HTML5/PDF/VIDEO: tracking manual via "Marcar como visto"
 *
 * Navigation:
 *   - Anterior/Siguiente abajo (sticky)
 *   - Back va al course detail (router.back)
 */
import { useEffect, useRef } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../../../src/design/colors'
import { typography } from '../../../../src/design/typography'
import {
  useLesson,
  useEnrollmentProgress,
  useTrackProgress,
  useLearningCourse,
} from '../../../../src/features/learning/hooks/useLearning'
import { Html5LessonPlayer } from '../../../../src/features/learning/components/Html5LessonPlayer'
import { AudioLessonPlayer } from '../../../../src/features/learning/components/AudioLessonPlayer'
import { MediaExternalPlayer } from '../../../../src/features/learning/components/MediaExternalPlayer'

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { data: lesson, isLoading } = useLesson(id)
  const { data: course } = useLearningCourse(lesson?.module.course.slug)
  const { data: progressList } = useEnrollmentProgress(lesson?.enrollmentId)
  const trackProgress = useTrackProgress(id ?? '', lesson?.enrollmentId ?? '')

  // Time-spent tracking — interval cada 5s flush a backend
  const timeSpentRef = useRef(0)
  const lastTickRef = useRef(Date.now())

  useEffect(() => {
    if (!lesson) return
    const interval = setInterval(() => {
      const now = Date.now()
      const delta = Math.floor((now - lastTickRef.current) / 1000)
      lastTickRef.current = now
      timeSpentRef.current += delta
      if (timeSpentRef.current >= 30) {
        trackProgress.mutate({ timeSpentDeltaSeconds: timeSpentRef.current })
        timeSpentRef.current = 0
      }
    }, 5000)
    return () => {
      clearInterval(interval)
      // Flush al desmontar
      if (timeSpentRef.current > 0) {
        trackProgress.mutate({ timeSpentDeltaSeconds: timeSpentRef.current })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  if (isLoading || !lesson) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      </SafeAreaView>
    )
  }

  const currentProgress = progressList?.find((p) => p.lessonId === lesson.id)
  const isCompleted = !!currentProgress?.completedAt

  // Find next/prev lesson in course
  const allLessons =
    course?.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleOrder: m.order }))) ?? []
  const currentIdx = allLessons.findIndex((l) => l.id === lesson.id)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx >= 0 && currentIdx < allLessons.length - 1

  const handleProgressTick = (positionSec: number, completed: boolean) => {
    trackProgress.mutate({
      bookmarkPosition: Math.floor(positionSec),
      completed: completed ? true : undefined,
    })
  }

  const handleMarkComplete = () => {
    trackProgress.mutate({ completed: true })
    if (hasNext) {
      setTimeout(() => router.push(`/(app)/aprende/lesson/${allLessons[currentIdx + 1].id}`), 200)
    } else if (lesson.enrollmentId) {
      // Última lección → ir al examen
      setTimeout(() => router.push(`/(app)/aprende/attempt/${lesson.enrollmentId}`), 200)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerCourse} numberOfLines={1}>
            {lesson.module.course.title}
          </Text>
          <Text style={styles.headerLesson}>
            Mod {lesson.module.order} · Lec {lesson.order}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{lesson.title}</Text>

        <View style={{ marginTop: 16 }}>
          <LessonContent
            lesson={lesson}
            initialBookmarkPosition={currentProgress?.bookmarkPosition ?? undefined}
            onProgressTick={handleProgressTick}
          />
        </View>
      </ScrollView>

      {/* Footer sticky con Prev/Mark/Next */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.footerBtn, !hasPrev && styles.footerBtnDisabled]}
          onPress={() => hasPrev && router.push(`/(app)/aprende/lesson/${allLessons[currentIdx - 1].id}`)}
          disabled={!hasPrev}
        >
          <Text style={[styles.footerBtnText, !hasPrev && styles.footerBtnTextDisabled]}>
            ← Anterior
          </Text>
        </Pressable>

        {isCompleted ? (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>✓ Completada</Text>
          </View>
        ) : (
          <Pressable style={styles.markBtn} onPress={handleMarkComplete}>
            <Text style={styles.markBtnText}>
              {hasNext ? 'Siguiente →' : 'Ir al examen →'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

// ─── Switch por LessonType ─────────────────────────────────────────────────

function LessonContent(props: {
  lesson: {
    id: string
    enrollmentId: string
    type:
      | 'HTML5_NATIVE'
      | 'VIDEO_MP4'
      | 'AUDIO_MP3'
      | 'PDF_DOCUMENT'
      | 'SCORM_12'
      | 'SCORM_2004'
      | 'XAPI_PACKAGE'
      | 'CMI5_AU'
    title: string
    contentJson: unknown
    audioUrl: string | null
    videoUrl: string | null
    pdfUrl: string | null
    transcriptText: string | null
    durationMinutes: number
    module: { course: { title: string; slug: string } }
  }
  initialBookmarkPosition?: number
  onProgressTick: (positionSec: number, isCompleted: boolean) => void
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
          lessonId={lesson.id}
          enrollmentId={lesson.enrollmentId}
          audioUrl={lesson.audioUrl}
          title={lesson.title}
          courseTitle={lesson.module.course.title}
          courseSlug={lesson.module.course.slug}
          transcriptText={lesson.transcriptText}
          initialBookmarkPosition={props.initialBookmarkPosition}
          onProgressTick={props.onProgressTick}
        />
      ) : (
        <EmptyMedia label="audio" />
      )

    case 'VIDEO_MP4':
      return lesson.videoUrl ? (
        <MediaExternalPlayer
          url={lesson.videoUrl}
          type="VIDEO_MP4"
          title={lesson.title}
          durationMinutes={lesson.durationMinutes}
          onProgressTick={props.onProgressTick}
        />
      ) : (
        <EmptyMedia label="video" />
      )

    case 'PDF_DOCUMENT':
      return lesson.pdfUrl ? (
        <MediaExternalPlayer
          url={lesson.pdfUrl}
          type="PDF_DOCUMENT"
          title={lesson.title}
          durationMinutes={lesson.durationMinutes}
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
        <View style={styles.proRequired}>
          <Text style={styles.proRequiredTitle}>Learning Pro requerido</Text>
          <Text style={styles.proRequiredBody}>
            Este tipo de contenido ({lesson.type}) está disponible en Zenix Learning Pro — Fase 2 v1.1.x.
          </Text>
        </View>
      )

    default:
      return null
  }
}

function EmptyMedia({ label }: { label: string }) {
  return (
    <View style={styles.emptyMedia}>
      <Text style={styles.emptyMediaText}>Esta lección no tiene {label} cargado.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas.primary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  back: { color: colors.text.primary, fontSize: 24, width: 24 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerCourse: {
    color: colors.text.tertiary,
    fontSize: 12,
    fontWeight: '500',
  },
  headerLesson: { color: colors.text.tertiary, fontSize: 10, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingBottom: 100 },
  title: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 8,
  },

  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.canvas.primary,
    gap: 10,
  },
  footerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.canvas.secondary,
  },
  footerBtnDisabled: { opacity: 0.4 },
  footerBtnText: { color: colors.text.primary, fontSize: 14, fontWeight: '500' },
  footerBtnTextDisabled: { color: colors.text.tertiary },

  markBtn: {
    flex: 1,
    backgroundColor: colors.brand[500],
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  markBtnText: { color: colors.text.inverse, fontSize: 14, fontWeight: '700' },

  completedBadge: {
    flex: 1,
    backgroundColor: colors.brand[600] + '33',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  completedText: { color: colors.brand[300], fontSize: 14, fontWeight: '600' },

  emptyMedia: {
    padding: 24,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyMediaText: { color: colors.text.tertiary, fontSize: 13 },

  proRequired: {
    padding: 20,
    backgroundColor: colors.warning[500] + '22',
    borderColor: colors.warning[500] + '66',
    borderWidth: 1,
    borderRadius: 12,
  },
  proRequiredTitle: {
    color: colors.warning[400],
    fontSize: 14,
    fontWeight: '600',
  },
  proRequiredBody: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
})
