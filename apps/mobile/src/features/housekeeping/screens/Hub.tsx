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

import { useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
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
import { useAuthStore } from '../../../store/auth'
import { useHousekeepingTasks } from '../api/useTasks'
import { TaskCard } from '../components/TaskCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'

// ─── Section item shape (header or row) ─────────────────────────────────────
type ListItem =
  | { type: 'header'; key: string; label: string; tint: string; count: number }
  | { type: 'card'; key: string; task: CleaningTaskDto }

interface SectionConfig {
  key: 'doubleUrgent' | 'sameDayCheckIn' | 'carryover' | 'normal' | 'done'
  label: string
  tint: string
}

const SECTIONS: SectionConfig[] = [
  { key: 'doubleUrgent',   label: '🔴⚠️ Doble urgente',  tint: colors.urgent[500] },
  { key: 'sameDayCheckIn', label: '🔴 Hoy entra',         tint: colors.urgent[400] },
  { key: 'carryover',      label: '⚠️ De ayer',           tint: colors.warning[500] },
  { key: 'normal',         label: '🟢 Normal',            tint: colors.brand[500] },
  { key: 'done',           label: '✓ Completadas hoy',    tint: 'rgba(167,139,250,0.7)' },
]

export function HousekeepingHub() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? ''
  const { groups, totalActive, completedToday, loading, refresh } = useHousekeepingTasks()

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
      count: tasks.length,
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
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <SectionHeader label={item.label} tint={item.tint} count={item.count} />
            ) : (
              <View style={styles.cardWrapper}>
                <TaskCard
                  task={item.task}
                  onPress={() => router.push(`/(app)/task/${item.task.id}`)}
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
    </SafeAreaView>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function SectionHeader({ label, tint, count }: { label: string; tint: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionDot, { backgroundColor: tint }]} />
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={styles.sectionCountWrap}>
          <Text style={styles.sectionCount}>{count}</Text>
        </View>
      </View>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🛏️</Text>
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionLabel: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.secondary,
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
  // Empty
  empty: {
    paddingTop: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 14,
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
