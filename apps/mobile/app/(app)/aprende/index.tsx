/**
 * Aprende — Dashboard learner mobile (tab principal).
 *
 * Layout vertical stack: Continue hero → Due soon → Assigned → Logros.
 * Pattern Docebo + NN/g (doc 05 §1 web paridad pero adaptado mobile-first).
 *
 * Empty state si DLC LEARNING_CORE no ACTIVE (caso §147 scope excluido).
 * El tab no debería aparecer si DLC inactivo (ZenixTabBar filtra), pero si
 * el user llega via deep link, mostramos accionable.
 */
import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../../src/design/colors'
import { typography } from '../../../src/design/typography'
import { IconGraduation, IconChevronRight } from '../../../src/design/icons'
import { useLearningDashboard } from '../../../src/features/learning/hooks/useLearning'
import { useDLCActive } from '../../../src/features/learning/hooks/useDLCActive'
import type { LearningEnrollmentSummary } from '../../../src/features/learning/api/learning.api'

export default function AprendeDashboard() {
  const router = useRouter()
  const { isActive: dlcActive } = useDLCActive('LEARNING_CORE')
  const { data, isLoading, refetch, isRefetching } = useLearningDashboard()

  if (!dlcActive) return <DlcInactiveState />

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.h1}>Aprende</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/aprende/catalog')}>
          <Text style={styles.headerLink}>Catálogo →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.brand[500]} />
        }
      >
        {/* Continuar */}
        {data?.continueLearning && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Continuar aprendiendo</Text>
            <ContinueHeroCard enrollment={data.continueLearning} />
          </View>
        )}

        {/* Due soon */}
        {data && data.dueSoon.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.urgent[500] }]}>
              Vence pronto ({data.dueSoon.length})
            </Text>
            {data.dueSoon.map((e) => (
              <DueRow key={e.id} enrollment={e} />
            ))}
          </View>
        )}

        {/* Assigned */}
        {data && data.assigned.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Asignados por tu supervisor</Text>
            <View style={styles.assignedRow}>
              {data.assigned.map((e) => (
                <AssignedCard key={e.id} enrollment={e} />
              ))}
            </View>
          </View>
        )}

        {/* Empty */}
        {!isLoading && data && !data.continueLearning && data.dueSoon.length === 0 && data.assigned.length === 0 && (
          <View style={styles.empty}>
            <IconGraduation size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Aún no tienes cursos</Text>
            <Text style={styles.emptyBody}>Explora el catálogo para empezar.</Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => router.push('/(app)/aprende/catalog')}
            >
              <Text style={styles.ctaText}>Ver catálogo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function ContinueHeroCard({ enrollment }: { enrollment: LearningEnrollmentSummary }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.heroCard}
      onPress={() => router.push(`/(app)/aprende/course/${enrollment.course.slug}`)}
    >
      <IconGraduation size={28} color={colors.brand[500]} />
      <View style={styles.heroBody}>
        <Text style={styles.heroTitle}>{enrollment.course.title}</Text>
        {enrollment.course.estimatedHours && (
          <Text style={styles.heroSub}>~{enrollment.course.estimatedHours} hrs estimadas</Text>
        )}
      </View>
      <IconChevronRight size={20} color={colors.text.tertiary} />
    </TouchableOpacity>
  )
}

function DueRow({ enrollment }: { enrollment: LearningEnrollmentSummary }) {
  const router = useRouter()
  const days = enrollment.expiresAt
    ? Math.ceil((new Date(enrollment.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  return (
    <TouchableOpacity
      style={styles.dueRow}
      onPress={() => router.push(`/(app)/aprende/course/${enrollment.course.slug}`)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.dueTitle}>{enrollment.course.title}</Text>
        {days !== null && (
          <Text style={styles.dueDays}>
            Vence en {days} día{days !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
      <IconChevronRight size={18} color={colors.text.tertiary} />
    </TouchableOpacity>
  )
}

function AssignedCard({ enrollment }: { enrollment: LearningEnrollmentSummary }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={styles.assignedCard}
      onPress={() => router.push(`/(app)/aprende/course/${enrollment.course.slug}`)}
    >
      <Text numberOfLines={2} style={styles.assignedTitle}>{enrollment.course.title}</Text>
      <Text style={styles.assignedStatus}>
        {enrollment.status === 'IN_PROGRESS' ? 'En progreso' : 'Sin abrir'}
      </Text>
    </TouchableOpacity>
  )
}

function DlcInactiveState() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.empty}>
        <IconGraduation size={64} color={colors.text.tertiary} />
        <Text style={styles.emptyTitle}>Zenix Learning no está activo</Text>
        <Text style={styles.emptyBody}>
          Tu admin puede habilitarlo desde Settings → Add-Ons. Tu data se preserva si lo cancelas.
        </Text>
      </View>
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  h1: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
  },
  headerLink: { color: colors.brand[500], fontSize: 15, fontWeight: '600' },
  content: { paddingBottom: 40 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.text.tertiary,
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.brand[600] + '33',
  },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  heroSub: { fontSize: 12, color: colors.text.tertiary, marginTop: 2 },
  dueRow: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: colors.urgent[500],
  },
  dueTitle: { fontSize: 15, fontWeight: '500', color: colors.text.primary },
  dueDays: { fontSize: 12, color: colors.urgent[500], marginTop: 2 },
  assignedRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  assignedCard: {
    flex: 1,
    minWidth: '47%',
    maxWidth: '48%',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    padding: 14,
    minHeight: 90,
  },
  assignedTitle: { fontSize: 14, fontWeight: '500', color: colors.text.primary },
  assignedStatus: { fontSize: 11, color: colors.text.tertiary, marginTop: 6 },
  empty: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text.primary, marginTop: 16 },
  emptyBody: { fontSize: 14, color: colors.text.tertiary, textAlign: 'center' },
  cta: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
  },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
