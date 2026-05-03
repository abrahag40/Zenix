/**
 * DayCompletionRitual — overlay full-screen 1×/día cuando los 3 anillos
 * cierran (Apple Fitness pattern + Loewenstein 1996).
 *
 * Justificación neuroquímica:
 *   Loewenstein 1996 — "Out of control: Visceral influences on behavior":
 *   los eventos raros amplifican la codificación emocional. Por eso el
 *   ritual ocurre **exactamente una vez por día** — no después de cada
 *   tarea (eso desensibiliza), no cada hora (eso interrumpe), sino una
 *   sola vez al cerrar el día. Ese único momento se vuelve memoria
 *   anclada — la persona recuerda el día completo como "exitoso".
 *
 * Diseño:
 *   - Confetti custom (sin dependencias) — 30 partículas SVG con física
 *     simulada en Reanimated (gravedad + drift horizontal)
 *   - Summary card con 3 datos: tareas, tiempo, racha
 *   - Mensaje variable del pool 'dayCompletion' (10 mensajes únicos)
 *   - Tap o auto-dismiss después de 6s
 *
 * Cap diario: persistido en AsyncStorage. La key `last-ritual-date`
 * registra la fecha local en que disparó. Si el usuario reinicia la app
 * o cambia tab, no se vuelve a disparar el mismo día.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import Svg, { Rect } from 'react-native-svg'
import { dashboardType } from '../../dashboard/typography'
import { decideCelebration } from './celebrationEngine'
import type { CelebrationMessage } from './celebrationPool'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const STORAGE_KEY = '@zenix:hk:last-ritual-date'

// ── Confetti math ──────────────────────────────────────────────────
const PARTICLE_COUNT = 30
const PARTICLE_COLORS = [
  '#34D399', // emerald (tasks ring)
  '#FBBF24', // amber (minutes ring)
  '#A78BFA', // indigo (verified ring)
  '#60A5FA', // sky (variety)
  '#F472B6', // pink (rare burst — celebratory)
]

interface ConfettiParticle {
  id: number
  startX: number
  endX: number
  endY: number
  rotation: number
  delay: number
  duration: number
  size: number
  color: string
}

function buildParticles(): ConfettiParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    startX: SCREEN_W / 2,
    endX: SCREEN_W / 2 + (Math.random() - 0.5) * SCREEN_W * 1.2,
    endY: SCREEN_H * 0.45 + Math.random() * SCREEN_H * 0.55,
    rotation: (Math.random() - 0.5) * 720,
    delay: Math.random() * 180,
    duration: 1200 + Math.random() * 800,
    size: 8 + Math.random() * 6,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
  }))
}

function ConfettiBurst({ play }: { play: boolean }) {
  const particles = useMemo(buildParticles, [])
  // Force re-mount each play so animations restart cleanly
  const key = play ? 'play' : 'idle'
  return (
    <View key={key} style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} p={p} play={play} />
      ))}
    </View>
  )
}

function Particle({ p, play }: { p: ConfettiParticle; play: boolean }) {
  const x = useSharedValue(p.startX)
  const y = useSharedValue(SCREEN_H * 0.4)
  const rot = useSharedValue(0)
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (!play) return
    opacity.value = withDelay(p.delay, withTiming(1, { duration: 100 }))
    x.value = withDelay(p.delay, withTiming(p.endX, {
      duration: p.duration,
      easing: Easing.out(Easing.quad),
    }))
    y.value = withDelay(p.delay, withTiming(p.endY, {
      duration: p.duration,
      // Gravity-like easing — accelerates downward
      easing: Easing.in(Easing.cubic),
    }))
    rot.value = withDelay(p.delay, withTiming(p.rotation, {
      duration: p.duration,
    }))
    opacity.value = withDelay(p.delay + p.duration - 200, withTiming(0, { duration: 200 }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play])

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: x.value - p.size / 2,
    top: y.value - p.size / 2,
    width: p.size,
    height: p.size,
    opacity: opacity.value,
    transform: [{ rotate: `${rot.value}deg` }],
  }))

  return (
    <Animated.View style={style}>
      <Svg width={p.size} height={p.size}>
        <Rect width={p.size} height={p.size} rx={1.5} fill={p.color} />
      </Svg>
    </Animated.View>
  )
}

// ── Ritual orchestrator ─────────────────────────────────────────────

export interface DayCompletionStats {
  /** Tasks completed today. */
  tasksDone: number
  /** Avg minutes per cleaning. */
  avgMinutes: number
  /** Current streak in days. */
  streakDays: number
  /** First name for personalization. */
  firstName: string
}

interface DayCompletionRitualProps {
  /** Becomes `true` when the staff just closed all 3 rings. */
  trigger: boolean
  stats: DayCompletionStats
  onClose: () => void
}

export function DayCompletionRitual({
  trigger,
  stats,
  onClose,
}: DayCompletionRitualProps) {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState<CelebrationMessage | null>(null)
  const cardOpacity = useSharedValue(0)
  const cardScale = useSharedValue(0.85)
  const cardY = useSharedValue(20)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (!trigger) return
    let cancelled = false
    ;(async () => {
      // Cap diaria — sólo una vez por día local
      const today = new Date().toISOString().slice(0, 10)
      const last = await AsyncStorage.getItem(STORAGE_KEY)
      if (last === today) return
      // Pick a celebration message from the dayCompletion category
      const msg = await decideCelebration({ trigger: 'dayCompletion' })
      if (cancelled) return
      setMessage(msg)
      setVisible(true)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      // Save the date so we don't re-trigger
      await AsyncStorage.setItem(STORAGE_KEY, today)
    })()
    return () => {
      cancelled = true
    }
  }, [trigger])

  useEffect(() => {
    if (!visible) return
    cardOpacity.value = withDelay(120, withTiming(1, { duration: 320 }))
    cardScale.value = withDelay(120, withSpring(1, { damping: 16, stiffness: 180 }))
    cardY.value = withDelay(120, withSpring(0, { damping: 18, stiffness: 200 }))

    // Auto-dismiss after 6s
    const id = setTimeout(() => handleDismiss(), 6000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const handleDismiss = () => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    cardOpacity.value = withTiming(0, { duration: 220 }, (done) => {
      'worklet'
      if (done) runOnJS(finalizeClose)()
    })
    cardY.value = withTiming(-12, { duration: 220 })
  }

  const finalizeClose = () => {
    setVisible(false)
    setMessage(null)
    dismissedRef.current = false
    onClose()
  }

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }, { translateY: cardY.value }],
  }))

  if (!visible) return null

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        {/* Confetti — fires once on mount */}
        <ConfettiBurst play={visible} />

        {/* Summary card */}
        <Animated.View style={[styles.card, cardStyle]} pointerEvents="box-none">
          {/* Center icon (closed-rings checkmark) */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconCheckmark}>✓</Text>
          </View>

          {/* Title — variable message + name */}
          <Text style={[dashboardType.titleLg, styles.title]}>
            {message?.text ?? 'Día completado'}
          </Text>
          <Text style={[dashboardType.body, styles.subtitle]}>
            {stats.firstName ? `Buen trabajo, ${stats.firstName}.` : 'Buen trabajo.'}
          </Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatBlock label="Tareas"  value={String(stats.tasksDone)} color="#34D399" />
            <StatBlock label="Avg/min" value={String(stats.avgMinutes)} color="#FBBF24" />
            <StatBlock label="Racha"   value={`${stats.streakDays}d`}    color="#A78BFA" />
          </View>

          <Text style={styles.dismissHint}>Toca para cerrar</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 6,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderWidth: 2,
    borderColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconCheckmark: {
    fontSize: 38,
    color: '#34D399',
    fontWeight: typography.weight.bold,
  },
  title: {
    textAlign: 'center',
    color: colors.text.primary,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 18,
    width: '100%',
    justifyContent: 'space-around',
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  dismissHint: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    marginTop: 18,
  },
})
