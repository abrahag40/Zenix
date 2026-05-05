/**
 * Testing — Soporte → Testing (mobile mirror del panel web).
 *
 * Funcionalidad idéntica al web `/settings/support` → tab Testing:
 *   - Toggle de feature flags `test.*`
 *   - Configuración inline (e.g. staffEmail para test.alarm)
 *   - Banner de advertencia si hay flags activos
 *   - Audit footer (último cambio + actor)
 *
 * Acceso: solo SUPERVISOR. El backend valida con @Roles, esta es defensa
 * UI — la fila en /yo solo se renderiza para SUPERVISOR.
 */

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Stack, useRouter } from 'expo-router'
import { api, ApiError } from '../../src/api/client'
import { colors } from '../../src/design/colors'
import { typography } from '../../src/design/typography'
import { dashboardType } from '../../src/features/dashboard/typography'
import { EdgeSwipeBack } from '../../src/features/navigation/EdgeSwipeBack'

interface FeatureFlag {
  id: string
  key: string
  enabled: boolean
  config: Record<string, unknown> | null
  description: string | null
  updatedAt: string
  updatedBy: { id: string; name: string } | null
}

type ConfigFieldType = 'text' | 'email' | 'staff-picker' | 'number'

interface ConfigFieldSpec {
  name: string
  label: string
  placeholder?: string
  type?: ConfigFieldType
  /** For staff-picker: filtra por rol(es). */
  roleFilter?: string[]
}

interface FlagSpec {
  key: string
  title: string
  description: string
  configFields?: ConfigFieldSpec[]
}

const TESTING_FLAGS: FlagSpec[] = [
  {
    key: 'test.alarm',
    title: 'Alarma de tarea',
    description:
      'Reemite el SSE task:ready + push notification al housekeeper seleccionado para validar el flujo de alarma de extremo a extremo.',
    configFields: [
      {
        name: 'staffEmail',
        label: 'Housekeeper objetivo',
        type: 'staff-picker',
        roleFilter: ['HOUSEKEEPER'],
      },
      {
        name: 'intervalMinutes',
        label: 'Intervalo (minutos)',
        type: 'number',
        placeholder: '5',
      },
    ],
  },
]

interface StaffOption {
  id: string
  name: string
  email: string
  role: string
}

export default function TestingScreen() {
  const router = useRouter()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)

  async function fetchData() {
    try {
      // Paraleliza las dos llamadas para reducir tiempo de pantalla blanca.
      const [flagsData, staffData] = await Promise.all([
        api.get<FeatureFlag[]>('/v1/feature-flags'),
        api.get<StaffOption[]>('/staff'),
      ])
      setFlags(flagsData)
      setStaff(staffData)
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 403
          ? 'Solo supervisores pueden gestionar entornos de prueba.'
          : e instanceof Error
            ? e.message
            : 'Error cargando datos'
      Alert.alert('Error', msg, [{ text: 'OK', onPress: () => router.back() }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  async function upsert(key: string, enabled: boolean, config?: Record<string, unknown>) {
    setSubmittingKey(key)
    try {
      const spec = TESTING_FLAGS.find((f) => f.key === key)!
      await api.patch('/v1/feature-flags', {
        key,
        enabled,
        config,
        description: spec.description,
      })
      await fetchData()
      Haptics.notificationAsync(
        enabled
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      )
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSubmittingKey(null)
    }
  }

  const activeCount = flags.filter((f) => f.enabled && f.key.startsWith('test.')).length

  return (
    <EdgeSwipeBack>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Testing',
            headerStyle: { backgroundColor: colors.canvas.primary },
            headerTintColor: colors.text.primary,
          }}
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={dashboardType.sectionLabel}>ENTORNOS DE PRUEBA</Text>
            <Text style={styles.introBody}>
              Toggles persistentes para validar flujos end-to-end. Cada cambio queda
              registrado con quien lo activó y cuándo.
            </Text>
          </View>

          {/* Banner si hay flags activos — Norman 1988 forcing function. */}
          {activeCount > 0 && (
            <View style={styles.warnBanner}>
              <Text style={styles.warnEmoji}>⚠️</Text>
              <View style={styles.warnTextBox}>
                <Text style={styles.warnTitle}>
                  {activeCount} entorno{activeCount > 1 ? 's' : ''} de prueba activo
                  {activeCount > 1 ? 's' : ''}
                </Text>
                <Text style={styles.warnBody}>
                  Recuerda apagarlo{activeCount > 1 ? 's' : ''} cuando termines la
                  validación — los flujos de testing pueden interferir con la
                  operación real.
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.brand[500]} />
              <Text style={styles.loadingText}>Cargando flags...</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {TESTING_FLAGS.map((spec) => (
                <FlagCard
                  key={spec.key}
                  spec={spec}
                  flag={flags.find((f) => f.key === spec.key) ?? null}
                  staffOptions={staff}
                  isSubmitting={submittingKey === spec.key}
                  onToggle={(enabled, config) => upsert(spec.key, enabled, config)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </EdgeSwipeBack>
  )
}

function FlagCard({
  spec,
  flag,
  staffOptions,
  isSubmitting,
  onToggle,
}: {
  spec: FlagSpec
  flag: FeatureFlag | null
  staffOptions: StaffOption[]
  isSubmitting: boolean
  onToggle: (enabled: boolean, config?: Record<string, unknown>) => void
}) {
  const enabled = flag?.enabled ?? false

  // Local config: editable solo cuando flag está OFF (consistente con web).
  const [localConfig, setLocalConfig] = useState<Record<string, string>>(() => {
    const c = (flag?.config ?? {}) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const f of spec.configFields ?? []) {
      out[f.name] = (c[f.name] as string) ?? ''
    }
    return out
  })

  // Resync if server data updates (otro supervisor cambia el flag concurrentemente).
  useEffect(() => {
    if (!flag?.config) return
    const c = flag.config as Record<string, unknown>
    setLocalConfig((prev) => {
      const next = { ...prev }
      for (const f of spec.configFields ?? []) {
        if (c[f.name] !== undefined) next[f.name] = String(c[f.name])
      }
      return next
    })
  }, [flag?.config])

  // number fields have fallback defaults on the backend, so they're not blocking.
  const requiredFilled = (spec.configFields ?? [])
    .filter((f) => f.type !== 'number')
    .every((f) => (localConfig[f.name] ?? '').trim().length > 0)

  function handleToggle() {
    if (isSubmitting) return
    if (!enabled && !requiredFilled) {
      Alert.alert('Configuración incompleta', 'Llena todos los campos antes de activar.')
      return
    }
    onToggle(!enabled, localConfig)
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBox}>
          <Text style={styles.cardTitle}>{spec.title}</Text>
          <Text style={styles.cardDescription}>{spec.description}</Text>
        </View>
        {/* Switch */}
        <Pressable
          onPress={handleToggle}
          disabled={isSubmitting}
          style={[
            styles.switchTrack,
            enabled && styles.switchTrackOn,
            isSubmitting && { opacity: 0.5 },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
        >
          <View
            style={[
              styles.switchThumb,
              enabled && styles.switchThumbOn,
            ]}
          />
        </Pressable>
      </View>

      {/* Config fields */}
      {(spec.configFields ?? []).length > 0 && (
        <View style={styles.configBox}>
          {spec.configFields!.map((f) => {
            if (f.type === 'staff-picker') {
              const filtered = f.roleFilter
                ? staffOptions.filter((s) => f.roleFilter!.includes(s.role))
                : staffOptions
              const selectedEmail = localConfig[f.name] ?? ''
              return (
                <View key={f.name} style={styles.configField}>
                  <Text style={styles.configLabel}>{f.label}</Text>
                  {filtered.length === 0 ? (
                    <Text style={styles.emptyStaff}>
                      No hay housekeepers en esta propiedad.
                    </Text>
                  ) : (
                    <View style={styles.pickerGrid}>
                      {filtered.map((staff) => {
                        const isSelected = selectedEmail === staff.email
                        return (
                          <Pressable
                            key={staff.id}
                            onPress={() => {
                              if (enabled) return
                              Haptics.selectionAsync()
                              setLocalConfig((prev) => ({
                                ...prev,
                                [f.name]: staff.email,
                              }))
                            }}
                            disabled={enabled}
                            style={[
                              styles.staffPill,
                              isSelected && styles.staffPillSelected,
                              enabled && !isSelected && { opacity: 0.4 },
                            ]}
                          >
                            <View
                              style={[
                                styles.staffAvatar,
                                isSelected && styles.staffAvatarSelected,
                              ]}
                            >
                              <Text style={styles.staffAvatarText}>
                                {staff.name?.[0]?.toUpperCase() ?? '?'}
                              </Text>
                            </View>
                            <View style={styles.staffPillTextBox}>
                              <Text
                                style={[
                                  styles.staffName,
                                  isSelected && styles.staffNameSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {staff.name}
                              </Text>
                              <Text style={styles.staffEmail} numberOfLines={1}>
                                {staff.email}
                              </Text>
                            </View>
                            {isSelected && <Text style={styles.staffCheck}>✓</Text>}
                          </Pressable>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            }
            // Number input
            if (f.type === 'number') {
              return (
                <View key={f.name} style={styles.configField}>
                  <Text style={styles.configLabel}>{f.label}</Text>
                  <TextInput
                    value={localConfig[f.name] ?? ''}
                    onChangeText={(v) =>
                      setLocalConfig((prev) => ({ ...prev, [f.name]: v.replace(/[^0-9]/g, '') }))
                    }
                    placeholder={f.placeholder ?? '5'}
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="number-pad"
                    editable={!enabled}
                    style={[
                      styles.configInput,
                      styles.configInputNumber,
                      enabled && styles.configInputDisabled,
                    ]}
                  />
                </View>
              )
            }
            // Default: text input
            return (
              <View key={f.name} style={styles.configField}>
                <Text style={styles.configLabel}>{f.label}</Text>
                <TextInput
                  value={localConfig[f.name] ?? ''}
                  onChangeText={(v) =>
                    setLocalConfig((prev) => ({ ...prev, [f.name]: v }))
                  }
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType={f.type === 'email' ? 'email-address' : 'default'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!enabled}
                  style={[
                    styles.configInput,
                    enabled && styles.configInputDisabled,
                  ]}
                />
              </View>
            )
          })}
          {enabled && (
            <Text style={styles.configHint}>
              Apaga el flag para cambiar la selección.
            </Text>
          )}
        </View>
      )}

      {/* Audit footer */}
      {flag && (
        <View style={styles.auditFooter}>
          <Text style={styles.auditText}>
            Último cambio: {flag.updatedBy?.name ?? 'sistema'} ·{' '}
            {new Date(flag.updatedAt).toLocaleString('es-MX', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  intro: {
    gap: 6,
  },
  introBody: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },
  // ── Warning banner
  warnBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  warnEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  warnTextBox: {
    flex: 1,
    gap: 4,
  },
  warnTitle: {
    fontSize: typography.size.small,
    color: '#FBBF24',
    fontWeight: typography.weight.semibold,
  },
  warnBody: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  // ── Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  // ── List + Card
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitleBox: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  cardDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 17,
  },
  // ── Switch
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: '#34D399',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  switchThumbOn: {
    transform: [{ translateX: 18 }],
  },
  // ── Config
  configBox: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  configField: {
    gap: 4,
  },
  configLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  configInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: typography.size.small,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  configInputDisabled: {
    opacity: 0.5,
  },
  configInputNumber: {
    width: 100,
    textAlign: 'center',
  },
  configHint: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    paddingTop: 2,
  },
  // ── Staff picker
  emptyStaff: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  pickerGrid: {
    gap: 8,
  },
  staffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  staffPillSelected: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: '#34D399',
  },
  staffAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarSelected: {
    backgroundColor: '#34D399',
  },
  staffAvatarText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
  },
  staffPillTextBox: {
    flex: 1,
    gap: 2,
  },
  staffName: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
  },
  staffNameSelected: {
    color: '#34D399',
    fontWeight: typography.weight.semibold,
  },
  staffEmail: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  staffCheck: {
    fontSize: 16,
    color: '#34D399',
    fontWeight: typography.weight.bold,
    paddingHorizontal: 4,
  },
  // ── Audit
  auditFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  auditText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
})
