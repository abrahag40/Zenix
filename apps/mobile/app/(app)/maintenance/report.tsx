/**
 * /maintenance/report — formulario rápido para reportar problema (Sprint Mx-1B-M).
 *
 * Flujo Hick's Law: 5 pasos mínimos.
 *   1. Categoría (pill selector)
 *   2. Título corto (placeholder concreto)
 *   3. Foto opcional (cámara / galería)
 *   4. Toggle "🚨 Bloquea uso del cuarto" → CRITICAL automático
 *   5. Enviar
 *
 * Reglas de actor:
 *   - HOUSEKEEPER → requiresApproval=true (flujo B — supervisor mtto aprueba)
 *   - MAINTENANCE técnico → requiresApproval=true (mismo flujo)
 *   - SUPERVISOR → requiresApproval=false, puede asignarse a sí mismo
 *
 * Sprint Mx-1B-W2: la foto se sube vía `uploadsApi.uploadImage()` y su URL se
 * pasa al backend en `initialPhotoUrls`. Si el upload falla (red), el usuario
 * decide si crear el ticket sin foto (no perder el reporte) o cancelar.
 */

import { useState, useMemo } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, Stack } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import type { CreateMaintenanceTicketInput, TicketCategoryValue } from '@zenix/shared'
import { useAuthStore } from '../../../src/store/auth'
import { maintenanceApi } from '../../../src/features/maintenance/api/maintenance.api'
import { uploadsApi } from '../../../src/api/uploads.api'
import { colors } from '../../../src/design/colors'
import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
} from '../../../src/features/maintenance/utils/constants'

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

export default function ReportProblemScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [category, setCategory] = useState<TicketCategoryValue>('PLUMBING')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isCritical, setIsCritical] = useState(false)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSupervisor = user?.role === 'SUPERVISOR'

  const canSubmit = useMemo(
    () => title.trim().length >= 3 && !submitting,
    [title, submitting],
  )

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
    }
  }

  async function onSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // Sprint Mx-1B-W2: si hay foto, sube primero al endpoint /v1/uploads y
      // pasa la URL resultante como `initialPhotoUrls`. El backend crea el
      // ticket + adjunta la foto en la misma transacción.
      let initialPhotoUrls: string[] | undefined
      if (photoUri) {
        try {
          const uploaded = await uploadsApi.uploadImage(photoUri, 'maintenance')
          initialPhotoUrls = [uploaded.url]
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // No-block: ofrecer al usuario crear el ticket sin foto si subir
          // falló (mejor crear el reporte que perderlo por un fallo de red).
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
        priority: isCritical ? 'CRITICAL' : 'MEDIUM',
        requiresApproval: !isSupervisor,
        initialPhotoUrls,
      }
      const created = await maintenanceApi.create(dto)
      Alert.alert(
        '✓ Ticket creado',
        isSupervisor
          ? `Ticket ${created.friendlyId} creado y disponible para asignar.`
          : `Reportado al supervisor de mantenimiento. Te avisamos cuando lo revisen.`,
        [{ text: 'Ver tickets', onPress: () => router.replace('/trabajo' as never) }],
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert('No pudimos crear el ticket', msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.canvas} edges={['top']}>
      <Stack.Screen options={{ title: 'Reportar problema', headerShown: false }} />

      {/* Header manual (sin Stack.headerShown) */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.headerBack}>← Cancelar</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Reportar problema</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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

        {/* Título */}
        <Text style={styles.label}>¿Qué problema observaste?</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej. Llave del lavabo gotea constante"
          placeholderTextColor={colors.text.tertiary}
          maxLength={120}
        />
        <Text style={styles.hint}>{title.length}/120 · mínimo 3 caracteres</Text>

        {/* Descripción */}
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
            <Pressable onPress={() => setPhotoUri(null)} style={styles.photoRemove}>
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
              📤 La foto se sube automáticamente al crear el ticket. Si la red
              falla podrás reintentar desde el detalle.
            </Text>
          </View>
        )}

        {/* Toggle crítico */}
        <View style={styles.criticalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.criticalLabel}>🚨 Bloquea uso del cuarto</Text>
            <Text style={styles.criticalHint}>
              Marca como CRÍTICO. La habitación se bloquea automáticamente y sale del calendario.
            </Text>
          </View>
          <Switch
            value={isCritical}
            onValueChange={setIsCritical}
            trackColor={{ false: '#374151', true: colors.urgent[500] }}
            thumbColor={isCritical ? '#FCA5A5' : '#9CA3AF'}
          />
        </View>

        {/* Submit */}
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBack: { color: colors.brand[400], fontSize: 14, fontWeight: '500' },
  headerTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  label: { color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  pillActive: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: colors.brand[500],
  },
  pillText: { color: colors.text.secondary, fontSize: 13 },
  pillTextActive: { color: colors.brand[300], fontWeight: '600' },
  input: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 15,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  hint: { color: colors.text.tertiary, fontSize: 11, marginTop: 4 },
  photoPreviewWrap: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.canvas.secondary,
  },
  photoPreview: { width: '100%', height: 200 },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.30)',
  },
  photoBtnText: { color: colors.brand[300], fontWeight: '600', fontSize: 13 },
  photoBtnSecondary: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  photoBtnSecondaryText: { color: colors.text.secondary, fontWeight: '500', fontSize: 13 },
  uploadNotice: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  uploadNoticeText: { color: '#FCD34D', fontSize: 11, lineHeight: 16 },
  criticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 14,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
    gap: 12,
  },
  criticalLabel: { color: colors.text.primary, fontWeight: '600', fontSize: 14 },
  criticalHint: { color: colors.text.secondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  submitBtn: {
    marginTop: 24,
    backgroundColor: colors.brand[500],
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.text.inverse, fontWeight: '700', fontSize: 16 },
  footerHint: { color: colors.text.tertiary, fontSize: 11, textAlign: 'center', marginTop: 8 },
})
