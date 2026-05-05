/**
 * TaskHero — bloque visual de contexto al tope del task detail.
 *
 * Reemplaza el viejo `roomCard` plano con jerarquía visual real:
 *   - Accent strip lateral (color por prioridad — pre-attentive Treisman)
 *   - Status pill arriba (READY / IN_PROGRESS / DONE / etc.)
 *   - Número de habitación dominante (display L0)
 *   - Sub-info: floor, category, bed label si SHARED
 *   - Priority badges visibles (🔴 Hoy entra · ⚠️ De ayer · ✨ Sin limpieza)
 *   - Timer inline (cuando startedAt presente) — elimina la ElapsedTimer card separada.
 *     Apple Fitness Workouts pattern: tiempo transcurrido visible en el bloque de contexto,
 *     no en una tarjeta flotante adicional (Sweller 1988 cognitive load).
 */

import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { CleaningStatus } from '@zenix/shared'
import type { CleaningTaskDto } from '@zenix/shared'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { usePropertyType, shouldShowBedLabel } from '../../property/usePropertyType'

interface TaskHeroProps {
  task: CleaningTaskDto
}

const STATUS_LABEL: Record<CleaningStatus, string> = {
  [CleaningStatus.PENDING]:     'Esperando salida',
  [CleaningStatus.READY]:       'Lista para limpiar',
  [CleaningStatus.UNASSIGNED]:  'Sin asignar',
  [CleaningStatus.IN_PROGRESS]: 'Limpiando',
  [CleaningStatus.PAUSED]:      'Pausada',
  [CleaningStatus.DONE]:        'Terminada',
  [CleaningStatus.VERIFIED]:    'Verificada',
  [CleaningStatus.CANCELLED]:   'Cancelada',
  // Sprint 9 EC-6
  [CleaningStatus.DEFERRED]:    'En espera',
  [CleaningStatus.BLOCKED]:     'Bloqueada',
}

const STATUS_TINT: Record<CleaningStatus, { fg: string; bg: string }> = {
  [CleaningStatus.PENDING]:     { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.06)' },
  [CleaningStatus.READY]:       { fg: '#34D399', bg: 'rgba(52,211,153,0.14)' },
  [CleaningStatus.UNASSIGNED]:  { fg: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  [CleaningStatus.IN_PROGRESS]: { fg: '#60A5FA', bg: 'rgba(96,165,250,0.14)' },
  [CleaningStatus.PAUSED]:      { fg: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  [CleaningStatus.DONE]:        { fg: '#A78BFA', bg: 'rgba(167,139,250,0.14)' },
  [CleaningStatus.VERIFIED]:    { fg: '#A78BFA', bg: 'rgba(167,139,250,0.14)' },
  [CleaningStatus.CANCELLED]:   { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.04)' },
  // Sprint 9 EC-6 — DEFERRED amber soft, BLOCKED red soft (escala visual de urgencia)
  [CleaningStatus.DEFERRED]:    { fg: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  [CleaningStatus.BLOCKED]:     { fg: '#F87171', bg: 'rgba(248,113,113,0.16)' },
}

function priorityAccent(task: CleaningTaskDto): string {
  if (task.carryoverFromDate && task.hasSameDayCheckIn) return '#F87171'
  if (task.hasSameDayCheckIn) return '#FBBF24'
  if (task.carryoverFromDate) return '#F59E0B'
  return '#34D399'
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function TaskHero({ task }: TaskHeroProps) {
  const room = task.unit?.room
  const status = STATUS_TINT[task.status]
  const accent = priorityAccent(task)
  const propRules = usePropertyType()
  const showBedLabel = shouldShowBedLabel(propRules, room?.category)

  const isDoubleUrgent = task.carryoverFromDate && task.hasSameDayCheckIn
  const isSameDayArrival = task.hasSameDayCheckIn && !task.carryoverFromDate
  const isCarryover = !!task.carryoverFromDate && !task.hasSameDayCheckIn
  const isExtensionNoClean = task.extensionFlag === 'WITHOUT_CLEANING'

  // Inline timer — shows when IN_PROGRESS or PAUSED with a startedAt timestamp.
  // Replaces the separate ElapsedTimer card, saving vertical space (Sweller 1988).
  const showTimer = (
    task.status === CleaningStatus.IN_PROGRESS ||
    task.status === CleaningStatus.PAUSED
  ) && !!task.startedAt

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!showTimer || !task.startedAt) return
    const start = new Date(task.startedAt).getTime()
    const tick = () => setElapsed(Date.now() - start)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [showTimer, task.startedAt])

  const pulse = useSharedValue(1)
  useEffect(() => {
    if (showTimer && task.status === CleaningStatus.IN_PROGRESS) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      )
    } else {
      pulse.value = withTiming(1, { duration: 300 })
    }
  }, [showTimer, task.status, pulse])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }))

  // Dot color: blue when actively cleaning, amber when paused
  const timerDotColor = task.status === CleaningStatus.PAUSED ? '#FBBF24' : '#34D399'

  return (
    <View style={styles.card}>
      {/* Left accent strip — pre-attentive priority signal */}
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.body}>
        {/* Status pill */}
        <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.fg }]}>
          <Text style={[styles.statusText, { color: status.fg }]}>
            {STATUS_LABEL[task.status].toUpperCase()}
          </Text>
        </View>

        {/* Hero number — dominant L0 display */}
        <View style={styles.numberRow}>
          <Text style={styles.roomLabel}>Hab.</Text>
          <Text style={styles.roomNumber}>{room?.number ?? '—'}</Text>
        </View>

        {/* Sub-info */}
        <Text style={styles.subInfo}>
          {room?.category === 'PRIVATE'
            ? 'Habitación privada'
            : 'Dormitorio compartido'}
          {room?.floor != null ? ` · Piso ${room.floor}` : ''}
        </Text>

        {/* Bed label only when SHARED dorm + relevant property type */}
        {showBedLabel && task.unit && (
          <Text style={styles.bedLabel}>{task.unit.label}</Text>
        )}

        {/* Inline elapsed timer — no separate card (Sweller 1988 cognitive load) */}
        {showTimer && (
          <View style={styles.timerRow}>
            <View style={styles.timerDotWrap}>
              <Animated.View style={[
                styles.timerDotHalo,
                { backgroundColor: timerDotColor + '4D' },
                dotStyle,
              ]} />
              <View style={[styles.timerDotCore, { backgroundColor: timerDotColor }]} />
            </View>
            <Text style={[styles.timerValue, { color: timerDotColor }]}>
              {formatElapsed(elapsed)}
            </Text>
            <Text style={styles.timerLabel}>
              {task.status === CleaningStatus.PAUSED ? 'pausado' : 'en curso'}
            </Text>
          </View>
        )}

        {/* Priority badges row */}
        {(isDoubleUrgent || isSameDayArrival || isCarryover || isExtensionNoClean) && (
          <View style={styles.badgeRow}>
            {isDoubleUrgent && (
              <Badge text="🔴⚠️ Doble urgente" tint="#F87171" bgTint="rgba(248,113,113,0.14)" />
            )}
            {isSameDayArrival && (
              <Badge text="🔴 Hoy entra" tint="#FBBF24" bgTint="rgba(251,191,36,0.14)" />
            )}
            {isCarryover && (
              <Badge text="⚠️ De ayer" tint="#F59E0B" bgTint="rgba(245,158,11,0.14)" />
            )}
            {isExtensionNoClean && (
              <Badge text="✨ Extensión sin limpieza" tint="#A78BFA" bgTint="rgba(167,139,250,0.14)" />
            )}
          </View>
        )}
      </View>
    </View>
  )
}

function Badge({ text, tint, bgTint }: { text: string; tint: string; bgTint: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bgTint, borderColor: tint }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  accent: {
    width: 5,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    padding: 18,
    gap: 6,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  roomLabel: {
    fontSize: typography.size.body,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  roomNumber: {
    fontSize: 44,
    color: colors.text.primary,
    fontWeight: typography.weight.heavy,
    letterSpacing: -1.2,
    lineHeight: 48,
  },
  subInfo: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },
  bedLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  // ── Inline timer row ──────────────────────────────────────────────────
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  timerDotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  timerDotCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: typography.weight.heavy,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  // ── Priority badges ───────────────────────────────────────────────────
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
})
