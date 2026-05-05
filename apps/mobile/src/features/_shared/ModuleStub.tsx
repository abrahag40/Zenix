/**
 * ModuleStub — generic branded placeholder for unimplemented department modules.
 *
 * Used by:
 *   - features/maintenance/screens/Hub.tsx
 *   - features/laundry/screens/Hub.tsx
 *   - features/public-areas/screens/Hub.tsx
 *   - features/gardening/screens/Hub.tsx
 *   - features/reception/screens/Hub.tsx
 *
 * Why a shared stub (vs each module's own placeholder):
 *   - Consistency: all 5 stubs look identical except for icon + copy.
 *   - Faster Sprint 8I: 1 component reused 5×.
 *   - When a module gets real implementation, just delete the stub call
 *     and replace with real Hub component — zero migration.
 *
 * Design rationale:
 *   - Same canvas + animation pattern as Dashboard (consistency).
 *   - Module icon is large + emerald-tinted (signals "this is YOUR area").
 *   - Title + ETA + features-coming gives the user a clear roadmap.
 *   - No dummy data — empty state is honest, not theatrical.
 */

import { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'
import { MOTION } from '../../design/motion'

export interface ModuleStubProps {
  /** Module display name in the header (e.g., "Mantenimiento"). */
  title: string
  /** Short tagline shown under the title. */
  tagline: string
  /** Module icon component. Receives size + color. */
  Icon: (p: { size?: number; color?: string; active?: boolean }) => React.JSX.Element
  /** Estimated release version (e.g., "v1.1") shown in the ETA badge. */
  eta: string
  /** Bullet list of features that will land in this module. */
  features: string[]
}

export function ModuleStub({ title, tagline, Icon, eta, features }: ModuleStubProps) {
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

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero icon + title ─────────────────────────────────── */}
        <Animated.View style={[styles.hero, headerStyle]}>
          <View style={styles.iconBubble}>
            <Icon size={40} color={colors.brand[500]} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.tagline}>{tagline}</Text>
        </Animated.View>

        {/* ── ETA badge ─────────────────────────────────────────── */}
        <Animated.View style={[styles.etaBadge, bodyStyle]}>
          <Text style={styles.etaLabel}>Llega en</Text>
          <Text style={styles.etaValue}>{eta}</Text>
        </Animated.View>

        {/* ── Features list ─────────────────────────────────────── */}
        <Animated.View style={[styles.featuresCard, bodyStyle]}>
          <Text style={styles.featuresTitle}>Lo que vas a poder hacer</Text>
          <View style={styles.featuresList}>
            {features.map((feature, idx) => (
              <View key={idx} style={styles.featureRow}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Footer note ───────────────────────────────────────── */}
        <Animated.View style={bodyStyle}>
          <Text style={styles.footerNote}>
            Estamos construyendo este módulo con el mismo cuidado que ves
            en el resto de la app. Te avisaremos cuando esté listo.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
    textAlign: 'center',
  },
  tagline: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
  },
  etaBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  etaLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  etaValue: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.brand[400],
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  featuresCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  featuresTitle: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: 14,
  },
  featuresList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand[500],
    marginTop: 8,
  },
  featureText: {
    flex: 1,
    fontSize: typography.size.body,
    color: colors.text.secondary,
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
  },
  footerNote: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
    marginTop: 8,
    paddingHorizontal: 16,
  },
})
