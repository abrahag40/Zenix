/**
 * Aprende/course/[slug] — detalle de curso mobile.
 *
 * Header con tier/category/version + estimated hours + recertification.
 * CTA adaptativa: Inscribirme / Continuar / Ver certificado.
 * Lista de módulos colapsable + lessons summary.
 */
import { useRouter, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../../../src/design/colors'
import { typography } from '../../../../src/design/typography'
import {
  useLearningCourse,
  useCreateEnrollment,
  useMyEnrollments,
} from '../../../../src/features/learning/hooks/useLearning'

export default function CourseDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { data: course, isLoading } = useLearningCourse(slug)
  const { data: enrollments } = useMyEnrollments()
  const enrollMut = useCreateEnrollment()

  if (isLoading || !course) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      </SafeAreaView>
    )
  }

  const myEnrollment = enrollments?.find(
    (e) => e.courseId === course.id && e.status !== 'CANCELLED',
  )
  const isCompleted = myEnrollment?.status === 'COMPLETED'
  const isEnrolled = !!myEnrollment && myEnrollment.status !== 'EXPIRED'

  const handleStart = async () => {
    if (!myEnrollment) {
      // Self-enroll first
      try {
        await enrollMut.mutateAsync(course.id)
        // Reactivamos: el siguiente render verá el nuevo enrollment
        return
      } catch (err) {
        Alert.alert('Error', (err as Error).message)
        return
      }
    }
    // Navegar a la primera lección
    const firstLesson = course.modules[0]?.lessons[0]
    if (firstLesson) {
      router.push(`/(app)/aprende/lesson/${firstLesson.id}`)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Tier chips */}
        <View style={styles.chips}>
          <Chip text={course.tier} />
          <Chip text={course.category.replace(/_/g, ' ')} />
          <Chip text={`v${course.contentVersion}`} muted />
        </View>

        <Text style={styles.title}>{course.title}</Text>
        <Text style={styles.subtitle}>{course.shortDescription}</Text>

        {/* Stats */}
        <View style={styles.stats}>
          <Stat label="Horas" value={`~${course.estimatedHours}`} />
          <Stat label="Módulos" value={String(course.modules.length)} />
          {course.recertificationMonths && (
            <Stat label="Vigencia" value={`${course.recertificationMonths}m`} />
          )}
        </View>

        {/* CTA */}
        {isCompleted ? (
          <View style={styles.completedCard}>
            <Text style={styles.completedTitle}>✓ Completado</Text>
            {myEnrollment?.certificate && (
              <Text style={styles.completedSerial}>
                Certificado #{myEnrollment.certificate.serialNumber}
              </Text>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cta}
            onPress={handleStart}
            disabled={enrollMut.isPending}
          >
            <Text style={styles.ctaText}>
              {enrollMut.isPending
                ? 'Inscribiendo…'
                : isEnrolled
                  ? myEnrollment?.status === 'IN_PROGRESS'
                    ? 'Continuar'
                    : 'Empezar curso'
                  : 'Inscribirme'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Long description */}
        {course.longDescription && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Acerca del curso</Text>
            <Text style={styles.body}>{course.longDescription}</Text>
          </View>
        )}

        {/* Modules + lessons */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Contenido — {course.modules.length} módulos
          </Text>
          {course.modules.map((m) => (
            <View key={m.id} style={styles.moduleCard}>
              <View style={styles.moduleHeader}>
                <Text style={styles.moduleTitle}>
                  Módulo {m.order}. {m.title}
                </Text>
                <Text style={styles.moduleMin}>~{m.estimatedMinutes}m</Text>
              </View>
              {m.description && (
                <Text style={styles.moduleDesc}>{m.description}</Text>
              )}
              {m.lessons.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={styles.lessonRow}
                  onPress={() => isEnrolled && router.push(`/(app)/aprende/lesson/${l.id}`)}
                  disabled={!isEnrolled}
                >
                  <View style={styles.lessonDot} />
                  <Text style={styles.lessonText} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={styles.lessonMin}>{l.durationMinutes}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Assessment info */}
        {course.assessment && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Examen final</Text>
            <View style={styles.assessmentCard}>
              <AssessmentRow
                label="Preguntas"
                value={String(course.assessment.questionsPerAttempt)}
              />
              <AssessmentRow
                label="Tiempo"
                value={`${course.assessment.durationMinutes} min`}
              />
              <AssessmentRow label="Aprobación" value={`${course.passingScore}%`} />
              <AssessmentRow label="Intentos" value={String(course.maxAttempts)} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Primitives ────────────────────────────────────────────────────────────

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View style={[styles.chip, muted && styles.chipMuted]}>
      <Text style={[styles.chipText, muted && styles.chipTextMuted]}>{text}</Text>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function AssessmentRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.assessmentRow}>
      <Text style={styles.assessmentLabel}>{label}</Text>
      <Text style={styles.assessmentValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas.primary },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  back: { color: colors.text.primary, fontSize: 24 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: colors.brand[600] + '33',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipMuted: { backgroundColor: colors.canvas.secondary },
  chipText: { color: colors.brand[300], fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  chipTextMuted: { color: colors.text.tertiary },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    marginTop: 8,
    lineHeight: typography.size.body * 1.5,
  },

  stats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  cta: {
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },

  completedCard: {
    backgroundColor: colors.brand[600] + '22',
    borderColor: colors.brand[600],
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  completedTitle: { color: colors.brand[300], fontSize: 15, fontWeight: '600' },
  completedSerial: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 4,
    fontFamily: typography.family.monospace,
  },

  section: { marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.text.tertiary,
    marginBottom: 10,
  },
  body: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    lineHeight: typography.size.body * 1.5,
  },

  moduleCard: {
    backgroundColor: colors.canvas.secondary,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moduleTitle: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },
  moduleMin: { color: colors.text.tertiary, fontSize: 11 },
  moduleDesc: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 4,
  },

  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  lessonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.tertiary,
  },
  lessonText: { flex: 1, color: colors.text.secondary, fontSize: 13 },
  lessonMin: { color: colors.text.tertiary, fontSize: 11 },

  assessmentCard: {
    backgroundColor: colors.canvas.secondary,
    padding: 14,
    borderRadius: 12,
  },
  assessmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  assessmentLabel: { color: colors.text.tertiary, fontSize: 13 },
  assessmentValue: { color: colors.text.primary, fontSize: 13, fontWeight: '500' },
})
