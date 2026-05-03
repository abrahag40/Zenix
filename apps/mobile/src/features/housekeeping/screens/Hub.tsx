/**
 * Housekeeping Hub — REAL implementation (Sprint 8I — Chunk C).
 *
 * Connects to the backend (Sprint 8H) and renders the housekeeper's day:
 *   - Header with greeting + progress
 *   - Section: 🔴⚠️ Doble urgente (carryover + hoy entra)
 *   - Section: 🔴  Hoy entra
 *   - Section: ⚠️  Carryover
 *   - Section: 🟢  Normal
 *   - Section: ✓  Completadas hoy
 *
 * Design rationale:
 *   - Visual hierarchy → priorities arriba (Treisman pre-attentive).
 *   - Section colors → emerald/amber/red codes (CLAUDE.md §13b semantic palette).
 *   - Pull-to-refresh on FlatList.
 *   - Empty state when no tasks (BrandLoader-aligned tone).
 *   - Tap card → navigate to /(app)/task/[id] (existing detail screen).
 */

import { useEffect, useState, useRef, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import type { CleaningTaskDto } from '@zenix/shared'
import { CleaningStatus } from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { useHousekeepingTasks } from '../api/useTasks'
import { TaskCard } from '../components/TaskCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'
import {
  IconBed,
  IconZap,
  IconLogIn,
  IconRotateCcw,
  IconListTask,
  IconCheckCircle,
} from '../../../design/icons'
import { HubGamificationHeader } from '../gamification/HubGamificationHeader'
import { CelebrationToast } from '../gamification/CelebrationToast'
import { decideCelebration } from '../gamification/celebrationEngine'
import type { CelebrationMessage } from '../gamification/celebrationPool'
import { DayCompletionRitual } from '../gamification/DayCompletionRitual'
import { useDailyRings, useStaffStreak } from '../gamification/useGamification'

// ─── Section item shape (header or row) ─────────────────────────────────────
// Section level drives color psychology:
//   critical → red bg tint (Cialdini 1984: scarcity/urgency)
//   urgent   → lighter red (same signal, lower intensity)
//   warning  → amber (advisory, non-blocking)
//   normal   → no tint (neutral, Sistema 1: "no threat")
//   done     → dimmed (System 1: "can ignore")
type SectionLevel = 'critical' | 'urgent' | 'warning' | 'normal' | 'done'

type ListItem =
  | {
      type: 'header'
      key: string
      label: string
      tint: string
      level: SectionLevel
      count: number
      Icon: React.ComponentType<{ size?: number; color?: string }>
    }
  | { type: 'card'; key: string; task: CleaningTaskDto }

interface SectionConfig {
  key: 'doubleUrgent' | 'sameDayCheckIn' | 'carryover' | 'normal' | 'done'
  label: string
  tint: string
  level: SectionLevel
  Icon: React.ComponentType<{ size?: number; color?: string }>
}

const SECTIONS: SectionConfig[] = [
  { key: 'doubleUrgent',   label: 'Doble urgente',  tint: colors.urgent[500],  level: 'critical', Icon: IconZap         },
  { key: 'sameDayCheckIn', label: 'Hoy entra',      tint: colors.urgent[400],  level: 'urgent',   Icon: IconLogIn       },
  { key: 'carryover',      label: 'De ayer',        tint: colors.warning[500], level: 'warning',  Icon: IconRotateCcw   },
  { key: 'normal',         label: 'Normal',         tint: colors.brand[500],   level: 'normal',   Icon: IconListTask    },
  { key: 'done',           label: 'Completadas hoy',tint: '#A78BFA',           level: 'done',     Icon: IconCheckCircle },
]

export function HousekeepingHub() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? ''
  const { groups, totalActive, completedToday, loading, refresh } = useHousekeepingTasks()

  // Find the currently IN_PROGRESS task (there should only ever be one).
  const inProgressTask = useMemo(() => {
    const allActive = [
      ...groups.doubleUrgent,
      ...groups.sameDayCheckIn,
      ...groups.carryover,
      ...groups.normal,
    ]
    return allActive.find((t) => t.status === CleaningStatus.IN_PROGRESS) ?? null
  }, [groups])

  // Card press: navigate freely to the in-progress task; block other cards.
  // Completed/cancelled tasks are always navigable — no blocking.
  function handleCardPress(task: CleaningTaskDto) {
    const isCompleted =
      task.status === CleaningStatus.DONE ||
      task.status === CleaningStatus.VERIFIED ||
      task.status === CleaningStatus.CANCELLED
    if (inProgressTask && task.id !== inProgressTask.id && !isCompleted) {
      const roomNum = inProgressTask.unit?.room?.number ?? '?'
      Alert.alert(
        'Tarea en curso',
        `Ya estás limpiando la Hab. ${roomNum}. Pausa esa tarea antes de abrir otra.`,
        [
          { text: 'Ver tarea activa', onPress: () => router.push(`/(app)/task/${inProgressTask.id}`) },
          { text: 'Cancelar', style: 'cancel' },
        ],
      )
      return
    }
    router.push(`/(app)/task/${task.id}`)
  }

  // Gamification level — TODO(sprint-9): read from /v1/staff/:id/preferences.
  // For Sprint 8I we default to STANDARD. Supervisor will be able to flip
  // it from web (D9 — gestionada por supervisor, no auto-servida).
  // `as` cast keeps TypeScript from narrowing to the literal so downstream
  // guards (`!== 'OFF'`) compile even when the const is currently STANDARD.
  const gamificationLevel = 'STANDARD' as 'SUBTLE' | 'STANDARD' | 'OFF'

  // Celebration toast state — variable-ratio engine result.
  const [celebration, setCelebration] = useState<CelebrationMessage | null>(null)

  // Detect newly-completed tasks across renders to fire celebrations.
  // We watch the count; when it grows, we ask the engine.
  const lastCompletedCount = useRef(completedToday)
  useEffect(() => {
    if (completedToday > lastCompletedCount.current) {
      lastCompletedCount.current = completedToday
      // Fire decision asynchronously so the UI doesn't lag.
      decideCelebration({ trigger: 'taskCompleted' }).then((msg) => {
        if (msg) setCelebration(msg)
      }).catch(() => undefined)
    } else {
      lastCompletedCount.current = completedToday
    }
  }, [completedToday])

  // ── Day Completion Ritual orchestration ──────────────────────────
  // Watches the daily-rings endpoint. When `ringsCompleted` flips to
  // true, the ritual component handles the 1×/day persistence itself
  // (AsyncStorage). All we do here is feed it the trigger.
  const ringsQ = useDailyRings({ enabled: gamificationLevel !== 'OFF' })
  const streakQ = useStaffStreak({ enabled: gamificationLevel !== 'OFF' })
  const [ritualTrigger, setRitualTrigger] = useState(false)
  const lastRingsClosed = useRef(false)
  useEffect(() => {
    const closed = ringsQ.data?.ringsCompleted ?? false
    if (closed && !lastRingsClosed.current) {
      // Edge: rings just closed → trigger ritual (the component itself
      // checks `last-ritual-date` to enforce 1×/day even across reloads).
      setRitualTrigger(true)
    }
    lastRingsClosed.current = closed
  }, [ringsQ.data?.ringsCompleted])

  // Compute summary stats for the ritual card from live data.
  const ritualStats = useMemo(() => {
    const rings = ringsQ.data
    const tasksDone = rings?.tasksRing.value ?? completedToday
    const totalMin = rings?.minutesRing.value ?? 0
    const avgMinutes = tasksDone > 0 ? Math.round(totalMin / tasksDone) : 0
    return {
      tasksDone,
      avgMinutes,
      streakDays: streakQ.data?.currentDays ?? 0,
      firstName,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringsQ.data, streakQ.data, completedToday, firstName])

  // Mount animation
  const headerOpacity = useSharedValue(0)
  const headerY = useSharedValue(12)
  const bodyOpacity = useSharedValue(0)

  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 400, easing: MOTION.ease.spring })
    headerY.value = withSpring(0, MOTION.spring.standard)
    bodyOpacity.value = withDelay(120, withTiming(1, { duration: 500, easing: MOTION.ease.spring }))
  }, [])

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }))
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
  }))

  // Build flat list (sections + tasks)
  const listData: ListItem[] = []
  for (const section of SECTIONS) {
    const tasks = groups[section.key]
    if (tasks.length === 0) continue
    listData.push({
      type: 'header',
      key: `h-${section.key}`,
      label: section.label,
      tint: section.tint,
      level: section.level,
      count: tasks.length,
      Icon: section.Icon,
    })
    for (const task of tasks) {
      listData.push({ type: 'card', key: task.id, task })
    }
  }

  const totalAll = totalActive + completedToday
  const completionPercent = totalAll > 0 ? Math.round((completedToday / totalAll) * 100) : 0

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Animated.View style={headerStyle}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mi día</Text>
          <Text style={styles.subtitle}>
            {firstName ? `Hola ${firstName}, ` : ''}
            {totalActive > 0
              ? `${totalActive} ${totalActive === 1 ? 'habitación' : 'habitaciones'} pendientes`
              : '¡Día limpio! Sin tareas pendientes 🎉'}
          </Text>
        </View>

        {/* Progress bar */}
        {totalAll > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${completionPercent}%` },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {completedToday}/{totalAll} ·{' '}
              <Text style={styles.progressPercent}>{completionPercent}%</Text>
            </Text>
          </View>
        )}
      </Animated.View>

      <Animated.View style={[styles.flexFill, bodyStyle]}>
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          // ListHeaderComponent: gamification block + pinned active-task banner.
          ListHeaderComponent={
            <>
              <HubGamificationHeader level={gamificationLevel} />
              {inProgressTask && (
                <ActiveTaskBanner
                  task={inProgressTask}
                  onPress={() => router.push(`/(app)/task/${inProgressTask.id}`)}
                />
              )}
            </>
          }
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <SectionHeader label={item.label} tint={item.tint} level={item.level} count={item.count} Icon={item.Icon} />
            ) : (
              <View style={styles.cardWrapper}>
                <TaskCard
                  task={item.task}
                  isLocked={
                    !!inProgressTask &&
                    item.task.id !== inProgressTask.id &&
                    item.task.status !== CleaningStatus.DONE &&
                    item.task.status !== CleaningStatus.VERIFIED &&
                    item.task.status !== CleaningStatus.CANCELLED
                  }
                  onPress={() => handleCardPress(item.task)}
                />
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={colors.brand[400]}
            />
          }
          ListEmptyComponent={
            !loading ? <EmptyState /> : null
          }
        />
      </Animated.View>

      {/* Celebration toast — overlays content; variable-ratio gated */}
      <CelebrationToast
        message={celebration}
        onDismiss={() => setCelebration(null)}
      />

      {/* Day Completion Ritual — Loewenstein 1996, 1×/día.
          Self-gates persistence in AsyncStorage so a re-trigger across
          app restarts does not re-fire on the same calendar day. */}
      {gamificationLevel !== 'OFF' && (
        <DayCompletionRitual
          trigger={ritualTrigger}
          stats={ritualStats}
          onClose={() => setRitualTrigger(false)}
        />
      )}
    </SafeAreaView>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function SectionHeader({
  label, tint, level, count, Icon,
}: {
  label: string
  tint: string
  level: SectionLevel
  count: number
  Icon: React.ComponentType<{ size?: number; color?: string }>
}) {
  // Color psychology (Mehrabian-Russell 1974 + Treisman 1980):
  //   critical/urgent → red tint bg signals danger pre-attentively
  //   warning         → amber bg signals advisory state
  //   done            → dimmed — Sistema 1 reads "can ignore"
  //   normal          → no bg — neutral, no emotional signal
  const hasBg     = level === 'critical' || level === 'urgent' || level === 'warning'
  const bgOpacity = level === 'critical' ? '18' : level === 'urgent' ? '10' : '0A'
  const bgColor   = hasBg ? `${tint}${bgOpacity}` : 'transparent'

  const labelColor = level === 'done'
    ? colors.text.tertiary
    : level === 'normal'
      ? colors.text.secondary
      : tint

  const countBg    = level === 'done' || level === 'normal'
    ? colors.canvas.secondary
    : `${tint}22`
  const countColor = level === 'done' || level === 'normal'
    ? colors.text.tertiary
    : tint

  return (
    <View style={[styles.sectionHeader, { backgroundColor: bgColor }]}>
      <View style={styles.sectionHeaderRow}>
        {/* Left accent strip — only for sections with urgency signal */}
        {hasBg && (
          <View style={[styles.sectionAccent, { backgroundColor: tint }]} />
        )}
        {/* SVG icon — same color as label (Treisman pre-attentive dual-encoding) */}
        <Icon size={14} color={labelColor} />
        <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
        <View style={[styles.sectionCountWrap, { backgroundColor: countBg }]}>
          <Text style={[styles.sectionCount, { color: countColor }]}>{count}</Text>
        </View>
      </View>
    </View>
  )
}

function ActiveTaskBanner({
  task,
  onPress,
}: {
  task: CleaningTaskDto
  onPress: () => void
}) {
  const roomNum = task.unit?.room?.number ?? '?'
  return (
    <TouchableOpacity
      style={styles.activeBanner}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.activeBannerAccent} />
      <View style={styles.activeBannerBody}>
        <View style={styles.activeBannerTop}>
          <Text style={styles.activeBannerLabel}>LIMPIANDO AHORA</Text>
          <View style={styles.activeBannerPulse} />
        </View>
        <Text style={styles.activeBannerRoom}>Habitación {roomNum}</Text>
      </View>
      <Text style={styles.activeBannerCta}>Ver tarea →</Text>
    </TouchableOpacity>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <IconBed size={56} color={colors.text.tertiary} />
      </View>
      <Text style={styles.emptyTitle}>Tu día está limpio</Text>
      <Text style={styles.emptyBody}>
        No hay habitaciones pendientes asignadas a ti. Cuando recepción
        confirme una salida, te llegará una notificación.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  flexFill: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  title: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
  },
  subtitle: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    marginTop: 4,
  },
  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 6,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.canvas.secondary,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand[500],
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  progressPercent: {
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
  // List
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingTop: 18,
    paddingBottom: 8,
    paddingRight: 20,
    paddingLeft: 16,          // slightly less left — accent strip uses those 4px
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // 3px left strip — same pattern as TaskCard accent bar (Treisman pre-attentive)
  sectionAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  sectionLabel: {
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
  sectionCountWrap: {
    backgroundColor: colors.canvas.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionCount: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
  },
  cardWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  sep: {
    height: 4,
  },
  // Active task banner
  activeBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.30)',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  activeBannerAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: colors.brand[500],
  },
  activeBannerBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 3,
  },
  activeBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeBannerLabel: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.bold,
    color: colors.brand[400],
    letterSpacing: 0.8,
  },
  activeBannerPulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand[500],
  },
  activeBannerRoom: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  activeBannerCta: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
    paddingRight: 16,
  },
  // Empty
  empty: {
    paddingTop: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIconWrap: {
    marginBottom: 14,
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
    maxWidth: 320,
  },
})
