/**
 * /maintenance/report — formulario para reportar problema (Sprint Mx-1B-W2
 * + audit fixes T-7, T-13, T-8, T-2 del testing 2026-05-11).
 *
 * Flujo Hick's Law:
 *   1. Categoría (pill selector)
 *   2. **Ubicación** — selector "Habitación · X" o "Área general" + assetTag opcional
 *   3. Título corto
 *   4. Detalle opcional
 *   5. Foto opcional
 *   6. Toggle "🚨 Bloquea uso del cuarto" (CRITICAL) — solo si hay habitación
 *   7. Enviar
 *
 * Reglas de actor:
 *   - HOUSEKEEPER → requiresApproval=true (flujo B — supervisor mtto aprueba)
 *   - MAINTENANCE técnico → requiresApproval=true
 *   - SUPERVISOR → requiresApproval=false
 *
 * Apple HIG typography + spacing (testing T-6, T-9):
 *   - Body text 15-17pt mínimo (subhead/headline)
 *   - Padding consistente múltiplo de 8pt (Apple 8pt grid)
 *   - Touch targets ≥44pt
 *   - Section gaps 16-24pt
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Switch,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import type {
  CreateMaintenanceTicketInput,
  RoomDto,
  TicketCategoryValue,
} from '@zenix/shared'
import { useAuthStore } from '../../../src/store/auth'
import { api } from '../../../src/api/client'
import { maintenanceApi } from '../../../src/features/maintenance/api/maintenance.api'
import { uploadsApi } from '../../../src/api/uploads.api'
import { colors } from '../../../src/design/colors'
import { typography } from '../../../src/design/typography'
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
} from '../../../src/features/maintenance/utils/constants'
import {
  ErrorSheet,
  ErrorSheetIcons,
} from '../../../src/features/maintenance/components/ErrorSheet'
import { InputSheet } from '../../../src/features/maintenance/components/InputSheet'
import { DismissKeyboardView } from '../../../src/design/DismissKeyboardView'

const CATEGORIES: TicketCategoryValue[] = [
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'FURNITURE',
  'STRUCTURAL',
  'COSMETIC',
  'SAFETY',
  'PEST',
  'DEEP_CLEANING',
  'OTHER',
]

type Location =
  | { kind: 'room'; roomId: string; roomNumber: string }
  | { kind: 'asset'; assetTag: string }
  | { kind: 'area' } // sin habitación ni asset (área general no taggeada)

export default function ReportProblemScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [category, setCategory] = useState<TicketCategoryValue>('PLUMBING')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isCritical, setIsCritical] = useState(false)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoSize, setPhotoSize] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [location, setLocation] = useState<Location>({ kind: 'area' })
  const [showRoomPicker, setShowRoomPicker] = useState(false)
  const [showAssetInput, setShowAssetInput] = useState(false)
  const [assetDraft, setAssetDraft] = useState('')
  const [rooms, setRooms] = useState<RoomDto[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomSearch, setRoomSearch] = useState('')
  // Apple HIG "Custom Alert": para errores de negocio con contexto rico
  // (ej. "habitación con huéspedes activos") usamos sheet propio en lugar
  // de Alert nativo. Más jerarquía visual, mejor copy, animación spring.
  const [errorSheet, setErrorSheet] = useState<{
    tone: 'warning' | 'error'
    customIcon?: React.ReactNode
    title: string
    body: string
    primaryLabel?: string
  } | null>(null)

  const isSupervisor = user?.role === 'SUPERVISOR'

  // Bug T-13: reset completo cuando la pantalla gana focus de nuevo.
  // useFocusEffect dispara al montar Y cada vez que volvemos a la pantalla.
  useFocusEffect(
    useCallback(() => {
      setCategory('PLUMBING')
      setTitle('')
      setDescription('')
      setIsCritical(false)
      setPhotoUri(null)
      setPhotoSize(null)
      setLocation({ kind: 'area' })
      setShowRoomPicker(false)
      setShowAssetInput(false)
      setAssetDraft('')
      setRoomSearch('')
      setErrorSheet(null)
    }, []),
  )

  // Pre-cargar lista de rooms una sola vez por sesión.
  useEffect(() => {
    let cancelled = false
    setRoomsLoading(true)
    api
      .get<RoomDto[]>('/rooms')
      .then((data) => {
        if (!cancelled) setRooms(data)
      })
      .catch((err) => {
        console.error('No se pudo cargar rooms:', err)
      })
      .finally(() => {
        if (!cancelled) setRoomsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Filtrado del search bar — case insensitive, substring match
  // contra `room.number` (futuro: también podríamos hacer match contra `name`).
  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter((r) => r.number.toLowerCase().includes(q))
  }, [rooms, roomSearch])

  // T-7: el toggle "Bloquea cuarto" solo tiene sentido si hay habitación.
  const canBeCritical = location.kind === 'room'
  const effectiveCritical = isCritical && canBeCritical

  const isDirty = useMemo(
    () =>
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      !!photoUri ||
      location.kind !== 'area',
    [title, description, photoUri, location],
  )

  const canSubmit = useMemo(
    () => title.trim().length >= 3 && !submitting,
    [title, submitting],
  )

  function onBack() {
    if (!isDirty) {
      router.replace('/(app)/trabajo')
      return
    }
    Alert.alert(
      '¿Descartar reporte?',
      'Perderás los datos ingresados.',
      [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => router.replace('/(app)/trabajo'),
        },
      ],
    )
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Habilita el acceso a la cámara en Ajustes.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri)
      setPhotoSize(result.assets[0].fileSize ?? null)
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Habilita el acceso a tus fotos en Ajustes.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri)
      setPhotoSize(result.assets[0].fileSize ?? null)
    }
  }

  async function onSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      let initialPhotoUrls: string[] | undefined
      if (photoUri) {
        try {
          const uploaded = await uploadsApi.uploadImage(photoUri, 'maintenance', photoSize)
          initialPhotoUrls = [uploaded.url]
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const proceed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'No pudimos subir la foto',
              `${msg}\n\n¿Quieres crear el ticket sin foto?`,
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Crear sin foto', onPress: () => resolve(true) },
              ],
            )
          })
          if (!proceed) {
            setSubmitting(false)
            return
          }
        }
      }
      const dto: CreateMaintenanceTicketInput = {
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        priority: effectiveCritical ? 'CRITICAL' : 'MEDIUM',
        requiresApproval: !isSupervisor,
        initialPhotoUrls,
        roomId: location.kind === 'room' ? location.roomId : undefined,
        assetTag: location.kind === 'asset' ? location.assetTag : undefined,
      }
      const created = await maintenanceApi.create(dto)
      Alert.alert(
        '✓ Ticket creado',
        isSupervisor
          ? `Ticket ${created.friendlyId} creado y disponible para asignar.`
          : `Reportado al supervisor de mantenimiento. Te avisamos cuando lo revisen.`,
        [{ text: 'Ver tickets', onPress: () => router.replace('/(app)/trabajo') }],
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Si el mensaje del backend menciona "huéspedes activos" → conflict
      // de inventario → warning (no error de sistema). Diferenciar tones
      // ayuda al usuario a saber si fue su decisión o un fallo técnico.
      const isGuestConflict = /huésped|huesped|conflict|reubicación/i.test(msg)
      setErrorSheet({
        tone: isGuestConflict ? 'warning' : 'error',
        customIcon: isGuestConflict ? (
          <ErrorSheetIcons.Bed color="#FBBF24" />
        ) : undefined,
        title: isGuestConflict
          ? 'Habitación ocupada'
          : 'No pudimos crear el ticket',
        body: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const locationLabel =
    location.kind === 'room'
      ? `Hab. ${location.roomNumber}`
      : location.kind === 'asset'
      ? `🔧 ${location.assetTag}`
      : '📍 Área general (sin habitación)'

  return (
    <SafeAreaView style={styles.canvas} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.headerBack}>← Cancelar</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Reportar problema</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'on-drag'}
      >
        {/* Categoría */}
        <Text style={styles.label}>Categoría</Text>
        <View style={styles.pillRow}>
          {CATEGORIES.map((c) => {
            const active = c === category
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {CATEGORY_EMOJI[c]} {CATEGORY_LABEL[c]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Ubicación (T-7) */}
        <Text style={styles.label}>Ubicación del problema</Text>
        <Pressable
          onPress={() => setShowRoomPicker(true)}
          style={styles.locationCard}
        >
          <Text style={styles.locationLabel}>{locationLabel}</Text>
          <Text style={styles.locationChevron}>›</Text>
        </Pressable>
        <Text style={styles.hint}>
          Elige habitación específica si el problema afecta un cuarto. Para áreas
          como alberca o lavandería usa "Área".
        </Text>

        {/* Título — single-line: returnKeyType="done" cierra teclado */}
        <Text style={styles.label}>¿Qué problema observaste?</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej. Llave del lavabo gotea constante"
          placeholderTextColor={colors.text.tertiary}
          maxLength={120}
          returnKeyType="done"
          blurOnSubmit={true}
        />
        <Text style={styles.hint}>{title.length}/120 · mínimo 3 caracteres</Text>

        {/* Descripción — multi-line: tap fuera dismissa (Apple HIG Notes pattern) */}
        <Text style={styles.label}>Detalle adicional (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={description}
          onChangeText={setDescription}
          placeholder="Contexto, dónde está, qué intentaste, etc."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        {/* Foto */}
        <Text style={styles.label}>Foto (opcional pero recomendado)</Text>
        {photoUri ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            <Pressable
              onPress={() => {
                setPhotoUri(null)
                setPhotoSize(null)
              }}
              style={styles.photoRemove}
            >
              <Text style={styles.photoRemoveText}>×</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.photoRow}>
          <Pressable onPress={pickFromCamera} style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>📷 Tomar foto</Text>
          </Pressable>
          <Pressable onPress={pickFromGallery} style={styles.photoBtnSecondary}>
            <Text style={styles.photoBtnSecondaryText}>🖼 Galería</Text>
          </Pressable>
        </View>
        {photoUri && (
          <View style={styles.uploadNotice}>
            <Text style={styles.uploadNoticeText}>
              📤 La foto se sube automáticamente al crear el ticket.
            </Text>
          </View>
        )}

        {/* Toggle crítico — visible solo si hay habitación */}
        {canBeCritical && (
          <View style={styles.criticalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.criticalLabel}>🚨 Bloquea uso del cuarto</Text>
              <Text style={styles.criticalHint}>
                Marca como CRÍTICO. La habitación se bloquea automáticamente en
                calendario y OTAs (Booking, Airbnb).
              </Text>
            </View>
            <Switch
              value={isCritical}
              onValueChange={setIsCritical}
              trackColor={{ false: '#374151', true: colors.urgent[500] }}
              thumbColor={isCritical ? '#FCA5A5' : '#9CA3AF'}
            />
          </View>
        )}
        {!canBeCritical && (
          <View style={styles.criticalDisabledRow}>
            <Text style={styles.criticalDisabledText}>
              ℹ️ El bloqueo de cuarto solo aplica cuando seleccionas una
              habitación específica.
            </Text>
          </View>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.submitText}>
              {isSupervisor ? 'Crear ticket' : 'Reportar al supervisor'}
            </Text>
          )}
        </Pressable>
        <Text style={styles.footerHint}>
          {isSupervisor
            ? 'Como supervisor, el ticket queda listo para asignar de inmediato.'
            : 'Tu reporte se enviará al supervisor de mantenimiento para aprobación.'}
        </Text>
      </ScrollView>

      {/* Modal selector de ubicación — Apple HIG iOS Contacts/Notes pattern:
          · Search bar prominente arriba (igual que iOS native pickers)
          · "Pull to dismiss" via handle visual + tap fuera
          · KeyboardAvoidingView para que el teclado no tape la lista
            mientras buscas */}
      <Modal
        visible={showRoomPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowRoomPicker(false)
          setRoomSearch('')
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.pickerBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setShowRoomPicker(false)
              setRoomSearch('')
            }}
          />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Ubicación</Text>

            {/* Search bar Apple-style (iOS Settings/Contacts pattern) */}
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={roomSearch}
                onChangeText={setRoomSearch}
                placeholder="Buscar habitación o asset…"
                placeholderTextColor={colors.text.tertiary}
                style={styles.searchInput}
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                blurOnSubmit={true}
              />
            </View>

            {/* Opciones fijas — Área general + Asset */}
            <Pressable
              onPress={() => {
                setLocation({ kind: 'area' })
                setShowRoomPicker(false)
                setRoomSearch('')
              }}
              style={styles.pickerRow}
            >
              <Text style={styles.pickerRowText}>📍 Área general (sin habitación)</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowRoomPicker(false)
                setRoomSearch('')
                setShowAssetInput(true)
                setAssetDraft(location.kind === 'asset' ? location.assetTag : '')
              }}
              style={styles.pickerRow}
            >
              <Text style={styles.pickerRowText}>
                🔧 Asset / equipo (lavadora, alberca, generador, …)
              </Text>
            </Pressable>

            <View style={styles.pickerDivider} />
            <Text style={styles.pickerSectionLabel}>
              Habitaciones ({filteredRooms.length}
              {roomSearch.trim() ? ` de ${rooms.length}` : ''})
            </Text>

            {roomsLoading ? (
              <ActivityIndicator color={colors.brand[500]} style={{ marginVertical: 20 }} />
            ) : filteredRooms.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                {roomSearch.trim()
                  ? `Ninguna habitación coincide con "${roomSearch}".`
                  : 'No hay habitaciones cargadas.'}
              </Text>
            ) : (
              <FlatList
                data={filteredRooms}
                keyExtractor={(r) => r.id}
                style={{ maxHeight: 320 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setLocation({ kind: 'room', roomId: item.id, roomNumber: item.number })
                      setShowRoomPicker(false)
                      setRoomSearch('')
                    }}
                    style={styles.pickerRow}
                  >
                    <Text style={styles.pickerRowText}>Hab. {item.number}</Text>
                  </Pressable>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Asset/equipo input — usa InputSheet estandarizado (testing T-modal
          standardize): mismo lenguaje visual y animaciones que ErrorSheet. */}
      <InputSheet
        open={showAssetInput}
        tone="info"
        title="Asset o equipo"
        description="Identifica el activo (lavadora, alberca, etc.) para histórico por equipo."
        placeholder="Ej. Lavadora-2 · Alberca · Generador"
        initialValue={assetDraft}
        maxLength={80}
        minLength={2}
        primaryLabel="Guardar"
        secondaryLabel="Cancelar"
        onClose={() => setShowAssetInput(false)}
        onSubmit={(tag) => {
          setLocation({ kind: 'asset', assetTag: tag })
          setShowAssetInput(false)
        }}
      />

      {/* Custom error sheet (Apple HIG — alerts con copy enriquecido + iconografía) */}
      <ErrorSheet
        open={!!errorSheet}
        tone={errorSheet?.tone}
        customIcon={errorSheet?.customIcon}
        title={errorSheet?.title ?? ''}
        body={errorSheet?.body ?? ''}
        primaryAction={{
          label: errorSheet?.primaryLabel ?? 'Entendido',
          onPress: () => setErrorSheet(null),
        }}
        onClose={() => setErrorSheet(null)}
      />
    </SafeAreaView>
  )
}

// ── Estilos — Apple HIG: 8pt grid, body 15pt, headline 17pt semibold, padding 16-20pt
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBack: { color: colors.brand[400], fontSize: typography.size.bodyLg, fontWeight: '500' },
  headerTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 56 },
  label: {
    color: colors.text.primary,
    fontSize: typography.size.bodyLg,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10, // 44pt touch target con texto 15pt
    borderRadius: 999,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  pillActive: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: colors.brand[500],
  },
  pillText: { color: colors.text.secondary, fontSize: typography.size.body },
  pillTextActive: { color: colors.brand[300], fontWeight: '600' },
  // Selector de ubicación
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  locationLabel: { flex: 1, color: colors.text.primary, fontSize: typography.size.body },
  locationChevron: { color: colors.text.tertiary, fontSize: 22, marginLeft: 8 },
  input: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  hint: { color: colors.text.tertiary, fontSize: typography.size.micro, marginTop: 6, lineHeight: 16 },
  photoPreviewWrap: {
    position: 'relative',
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.canvas.secondary,
  },
  photoPreview: { width: '100%', height: 220 },
  photoRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 20, lineHeight: 22 },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1,
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.30)',
  },
  photoBtnText: { color: colors.brand[300], fontWeight: '600', fontSize: typography.size.body },
  photoBtnSecondary: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  photoBtnSecondaryText: { color: colors.text.secondary, fontWeight: '500', fontSize: typography.size.body },
  uploadNotice: {
    marginTop: 10,
    padding: 12,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  uploadNoticeText: { color: '#6EE7B7', fontSize: typography.size.small, lineHeight: 18 },
  criticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
    gap: 14,
  },
  criticalLabel: { color: colors.text.primary, fontWeight: '600', fontSize: typography.size.body },
  criticalHint: {
    color: colors.text.secondary,
    fontSize: typography.size.micro,
    marginTop: 4,
    lineHeight: 16,
  },
  criticalDisabledRow: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  criticalDisabledText: { color: colors.text.tertiary, fontSize: typography.size.small, lineHeight: 18 },
  submitBtn: {
    marginTop: 28,
    backgroundColor: colors.brand[500],
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.text.inverse, fontWeight: '700', fontSize: typography.size.bodyLg },
  footerHint: {
    color: colors.text.tertiary,
    fontSize: typography.size.micro,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
  // Picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.canvas.tertiary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
    alignSelf: 'center',
    marginBottom: 14,
  },
  pickerTitle: {
    fontSize: typography.size.bodyLg,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  // Apple HIG search bar — iOS Contacts/Settings pattern.
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: { fontSize: typography.size.body, marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  pickerSectionLabel: {
    fontSize: typography.size.micro,
    textTransform: 'uppercase',
    color: colors.text.tertiary,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  pickerDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 12,
  },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  pickerRowText: { color: colors.text.primary, fontSize: typography.size.body },
  pickerEmpty: {
    color: colors.text.tertiary,
    fontSize: typography.size.small,
    textAlign: 'center',
    paddingVertical: 24,
  },
  // Asset input modal
  assetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  assetCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  assetTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '700' },
  assetBody: {
    color: colors.text.secondary,
    fontSize: typography.size.small,
    marginTop: 6,
    lineHeight: 18,
  },
  assetInput: {
    marginTop: 14,
    backgroundColor: colors.canvas.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  assetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  assetBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  assetBtnSecondary: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  assetBtnSecondaryText: { color: colors.text.primary, fontWeight: '600', fontSize: typography.size.body },
  assetBtnPrimary: { backgroundColor: colors.brand[500] },
  assetBtnPrimaryText: { color: colors.text.inverse, fontWeight: '700', fontSize: typography.size.body },
})
