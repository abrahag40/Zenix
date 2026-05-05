/**
 * Yo — Tab 4 (Profile + Settings menu).
 *
 * Design rationale (Facebook / Instagram / WhatsApp settings pattern):
 *
 *   1. Identity card at the top (FB Profile, IG Profile)
 *      - Large avatar + name + role + property.
 *      - Tap to view full profile (Sprint 9).
 *
 *   2. Sectioned menu list (settings hub)
 *      - Group 1: "Tu cuenta" — account / preferences / language
 *      - Group 2: "Notificaciones y privacidad" — notification settings,
 *        privacy controls
 *      - Group 3: "Soporte" — help, about, version
 *      - Group 4: Logout (visually separated, danger styling)
 *
 *   3. Each row: icon + label + chevron
 *      - Material 3 + Apple Settings.app pattern.
 *      - 56dp min-height (Apple HIG touch targets).
 *      - Disclosure chevron tells user "this opens a sub-screen".
 *
 *   4. Logout in red, separated from main groups
 *      - Apple HIG "Destructive Actions": "Use red to mark destructive
 *        actions and confirm before executing."
 *      - Includes confirmation alert (cannot accidentally tap).
 *
 *   5. Brand version footer
 *      - "Zenix v1.0.0 · build 1" — matches Mews / Cloudbeds settings
 *        footer pattern. Useful for support tickets.
 */

import { useState } from 'react'
import { Alert, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { useAuthStore } from '../../src/store/auth'
import { colors } from '../../src/design/colors'
import { typography } from '../../src/design/typography'
import { MOTION } from '../../src/design/motion'
import {
  IconChevronRight,
  IconLogout,
  IconSettings,
  IconBell,
  IconLock,
  IconGlobe,
  IconHelp,
  IconSparkles,
} from '../../src/design/icons'
import { PropertySwitcherSheet } from '../../src/features/property/PropertySwitcherSheet'

export default function YoScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()
  const [showSwitcher, setShowSwitcher] = useState(false)

  const canSwitchProperty = user?.role === 'SUPERVISOR' || user?.role === 'RECEPTIONIST'

  function confirmLogout() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert(
      '¿Cerrar sesión?',
      'Vas a salir de tu cuenta. Tendrás que iniciar sesión de nuevo para continuar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            void logout()
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Identity card ─────────────────────────────────────── */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{user?.name?.[0]?.toUpperCase() ?? 'Z'}</Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'Usuario'}</Text>
          <Text style={styles.userRoleLine}>{roleLabel(user?.role)}</Text>

          {/* Property pill — tappable for SUPERVISOR/RECEPTIONIST.
              SwiftUI standard: pill with chevron + scale-down on press. */}
          {canSwitchProperty ? (
            <PropertyPill
              propertyName={user?.propertyName ?? '—'}
              onPress={() => setShowSwitcher(true)}
            />
          ) : (
            <View style={styles.propertyPillStatic}>
              <Text style={styles.propertyPillStaticText}>{user?.propertyName ?? '—'}</Text>
            </View>
          )}
        </View>

        {/* ── Group: Tu cuenta ──────────────────────────────────── */}
        <SettingsGroup title="Tu cuenta">
          <SettingsRow
            Icon={IconSettings}
            label="Configuración general"
            description="Idioma, tema, preferencias"
            onPress={() => Alert.alert('Próximamente', 'Configuración disponible en el siguiente sprint.')}
          />
          <SettingsRow
            Icon={IconSparkles}
            label="Gamificación"
            description="Personalizar tu experiencia"
            onPress={() => Alert.alert('Próximamente', 'Habla con tu supervisor para ajustar este nivel.')}
          />
        </SettingsGroup>

        {/* ── Group: Notificaciones y privacidad ────────────────── */}
        <SettingsGroup title="Notificaciones y privacidad">
          <SettingsRow
            Icon={IconBell}
            label="Notificaciones push"
            description="Avisos de nuevas tareas"
            onPress={() => Alert.alert('Próximamente', 'Preferencias de notificación en Sprint 9+.')}
          />
          <SettingsRow
            Icon={IconLock}
            label="Privacidad y seguridad"
            description="Sesiones activas, datos personales"
            onPress={() => Alert.alert('Próximamente', 'Centro de privacidad en Sprint 9+.')}
          />
        </SettingsGroup>

        {/* ── Group: Soporte ────────────────────────────────────── */}
        <SettingsGroup title="Soporte">
          <SettingsRow
            Icon={IconHelp}
            label="Centro de ayuda"
            description="Tutoriales, FAQs"
            onPress={() => Alert.alert('Próximamente', 'Centro de ayuda en construcción.')}
          />
          {/* Testing — supervisor-only. Misma protección que en web
              (FeatureFlagsController @Roles SUPERVISOR). */}
          {user?.role === 'SUPERVISOR' && (
            <SettingsRow
              Icon={IconSettings}
              label="Testing"
              description="Activar/desactivar entornos de prueba"
              onPress={() => router.push('/testing')}
            />
          )}
        </SettingsGroup>

        {/* ── Logout (destructive, separated) ───────────────────── */}
        <View style={styles.logoutSection}>
          <SettingsRow
            Icon={IconLogout}
            label="Cerrar sesión"
            destructive
            onPress={confirmLogout}
          />
        </View>

        {/* ── Footer: brand + version ───────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Zenix</Text>
          <Text style={styles.footerVersion}>
            v{Constants.expoConfig?.version ?? '1.0.0'} · build dev
          </Text>
        </View>
      </ScrollView>

      <PropertySwitcherSheet
        visible={showSwitcher}
        onClose={() => setShowSwitcher(false)}
      />
    </SafeAreaView>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

/**
 * PropertyPill — tappable pill below the user name showing the active property.
 * SwiftUI parallel: capsule shape + chevron + spring scale on press, signaling
 * "this is interactive" without an extra explanatory label.
 */
function PropertyPill({ propertyName, onPress }: { propertyName: string; onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.96, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.propertyPill, animStyle]}>
        <Text style={styles.propertyPillText}>{propertyName}</Text>
        <IconChevronRight size={14} color={colors.brand[400]} />
      </Animated.View>
    </Pressable>
  )
}

interface SettingsRowProps {
  Icon: (p: { size?: number; color?: string }) => React.JSX.Element
  label: string
  description?: string
  destructive?: boolean
  onPress: () => void
}

function SettingsRow({ Icon, label, description, destructive, onPress }: SettingsRowProps) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
    >
      <Animated.View style={[styles.row, animStyle]}>
        <View style={[styles.rowIconWrap, destructive && styles.rowIconWrapDanger]}>
          <Icon size={20} color={destructive ? colors.urgent[400] : colors.text.secondary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, destructive && styles.rowLabelDanger]}>
            {label}
          </Text>
          {description && (
            <Text style={styles.rowDescription} numberOfLines={1}>
              {description}
            </Text>
          )}
        </View>
        {!destructive && <IconChevronRight size={18} color={colors.text.tertiary} />}
      </Animated.View>
    </Pressable>
  )
}

function roleLabel(role?: string): string {
  switch (role) {
    case 'HOUSEKEEPER': return 'Recamarista'
    case 'SUPERVISOR':  return 'Supervisor'
    case 'RECEPTIONIST':return 'Recepción'
    default:            return 'Equipo'
  }
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
  },
  // Identity
  identityCard: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: colors.brand[500],
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  avatarLetter: {
    fontSize: 38,
    fontWeight: typography.weight.heavy,
    color: colors.text.inverse,
  },
  userName: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
    marginBottom: 4,
  },
  userRoleLine: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
    marginBottom: 10,
  },
  // Tappable property pill (SUPERVISOR/RECEPTIONIST)
  propertyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: `${colors.brand[500]}1A`, // 10% emerald tint
    borderWidth: 1,
    borderColor: `${colors.brand[500]}40`,
  },
  // Static (non-tappable) pill for HOUSEKEEPER role
  propertyPillStatic: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.canvas.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  propertyPillText: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
  propertyPillStaticText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  // Group
  group: {
    marginTop: 18,
  },
  groupTitle: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    fontWeight: typography.weight.semibold,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
    minHeight: 56,           // Apple HIG min touch target
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.canvas.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIconWrapDanger: {
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
  },
  rowLabelDanger: {
    color: colors.urgent[400],
    fontWeight: typography.weight.semibold,
  },
  rowDescription: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  // Logout section
  logoutSection: {
    marginTop: 24,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 32,
    paddingVertical: 14,
  },
  footerBrand: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    color: colors.text.tertiary,
    letterSpacing: -0.5,
  },
  footerVersion: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    marginTop: 2,
  },
})
