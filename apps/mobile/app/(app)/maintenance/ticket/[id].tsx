/**
 * /maintenance/ticket/[id] — detalle de ticket (Sprint Mx-1B-M + fixes B1–B6).
 *
 * Acciones inline según rol y estado actual:
 *   - SUPERVISOR sobre OPEN pendingApproval → Aprobar / Rechazar (con modal razón)
 *   - Cualquier técnico sobre OPEN sin asignar → ✋ Tomar este ticket
 *   - Asignado sobre ACKNOWLEDGED → ▶ Iniciar
 *   - Asignado sobre IN_PROGRESS → ✓ Resolver / ⏸ Esperar piezas
 *   - Asignado sobre WAITING_PARTS → ▶ Reanudar
 *   - SUPERVISOR sobre RESOLVED → ✓ Verificar / ↩ Rechazar calidad (modal razón)
 *
 * Cada acción dispara API call → SSE → useMaintenanceTicket refetch automático.
 *
 * Bug fixes aplicados:
 *   · B1 Alert.prompt sustituido por modal in-app cross-platform
 *   · B2 verify-rejection (approved=false) expuesto como segundo botón
 *   · B3 isRefreshing distinto de isLoading — post-acción NO oculta el contenido
 *   · B5 status pill con color semántico (Treisman pre-attentive §13b)
 *   · B6 banner OOO consolida aging chip + mención Channex
 */

import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../../../src/store/auth'
import {
  useMaintenanceTicket,
} from '../../../../src/features/maintenance/api/useTickets'
import { maintenanceApi } from '../../../../src/features/maintenance/api/maintenance.api'
import { uploadsApi, resolveImageUrl } from '../../../../src/api/uploads.api'
import { colors } from '../../../../src/design/colors'
import {
  AGING_HEX,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  PRIORITY_BG,
  PRIORITY_HEX,
  PRIORITY_HEX_DARK,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  estimateAging,
  formatElapsed,
} from '../../../../src/features/maintenance/utils/constants'

type ReasonPrompt =
  | { kind: 'reject'; minLength: 5 }
  | { kind: 'verify-reject'; minLength: 5 }

export default function TicketDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const ticketId = typeof id === 'string' ? id : null
  const user = useAuthStore((s) => s.user)
  const { data: ticket, isLoading, error, refetch } = useMaintenanceTicket(ticketId)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')

  // Bug B1/B2 — modal in-app de razón (cross-platform, no usa Alert.prompt)
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null)
  const [reasonText, setReasonText] = useState('')

  // Mx-1B-W2 — composer de comentarios + uploader de fotos inline
  const [commentDraft, setCommentDraft] = useState('')
  const [photoLightboxUrl, setPhotoLightboxUrl] = useState<string | null>(null)

  if (!ticketId) return null

  const isMine = ticket?.assignedToId === user?.id
  const isSupervisor = user?.role === 'SUPERVISOR'
  const isMaintenance = user?.department === 'MAINTENANCE'

  async function runAction<T>(key: string, fn: () => Promise<T>, successMsg?: string) {
    setActionLoading(key)
    try {
      await fn()
      await refetch()
      if (successMsg) Alert.alert('✓', successMsg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert('No pudimos completar la acción', msg)
    } finally {
      setActionLoading(null)
    }
  }

  function onApprove() {
    if (!ticketId) return
    void runAction('approve', () => maintenanceApi.approve(ticketId), 'Ticket aprobado')
  }

  // Bug B1 — abre modal cross-platform en vez de Alert.prompt iOS-only
  function onReject() {
    setReasonText('')
    setReasonPrompt({ kind: 'reject', minLength: 5 })
  }

  // Bug B2 — verify-rejection: regresa a IN_PROGRESS con razón obligatoria
  function onVerifyReject() {
    setReasonText('')
    setReasonPrompt({ kind: 'verify-reject', minLength: 5 })
  }

  function onConfirmReason() {
    if (!ticketId || !reasonPrompt) return
    const text = reasonText.trim()
    if (text.length < reasonPrompt.minLength) {
      Alert.alert(
        'Razón requerida',
        `Mínimo ${reasonPrompt.minLength} caracteres para registrar el rechazo en el audit trail.`,
      )
      return
    }
    const prompt = reasonPrompt
    setReasonPrompt(null)
    if (prompt.kind === 'reject') {
      void runAction(
        'reject',
        () => maintenanceApi.reject(ticketId, { reason: text }),
        'Ticket rechazado',
      )
    } else {
      void runAction(
        'verify-reject',
        () => maintenanceApi.verify(ticketId, { approved: false, rejectionReason: text }),
        'Trabajo rechazado · reabierto al técnico',
      )
    }
  }

  function onClaim() {
    if (!ticketId) return
    void runAction('claim', () => maintenanceApi.claim(ticketId), 'Ticket tomado')
  }
  function onStart() {
    if (!ticketId) return
    void runAction('start', () => maintenanceApi.start(ticketId), 'Trabajo iniciado')
  }
  function onResume() {
    if (!ticketId) return
    void runAction('resume', () => maintenanceApi.resume(ticketId), 'Trabajo reanudado')
  }
  function onRequestParts() {
    if (!ticketId) return
    void runAction(
      'requestParts',
      () => maintenanceApi.requestParts(ticketId),
      'Marcado en espera de piezas',
    )
  }
  function onResolve() {
    if (!ticketId) return
    if (resolutionNote.trim().length < 3) {
      Alert.alert('Resumen requerido', 'Describe brevemente cómo se resolvió.')
      return
    }
    void runAction(
      'resolve',
      () => maintenanceApi.resolve(ticketId, { resolutionSummary: resolutionNote.trim() }),
      'Ticket resuelto. El supervisor verificará.',
    )
  }
  function onVerify() {
    if (!ticketId) return
    void runAction(
      'verify',
      () => maintenanceApi.verify(ticketId, { approved: true }),
      'Verificado. Habitación liberada.',
    )
  }

  // Mx-1B-W2 — comentar desde el detail (B4)
  async function onSubmitComment() {
    if (!ticketId) return
    const content = commentDraft.trim()
    if (content.length < 1) return
    await runAction(
      'comment',
      async () => {
        await maintenanceApi.addComment(ticketId, content)
        setCommentDraft('')
      },
    )
  }

  // Mx-1B-W2 — agregar foto desde el detail (técnico documenta progreso /
  // foto "después" al resolver / supervisor adjunta evidencia post-verify).
  async function onAddPhoto(isAfter: boolean) {
    if (!ticketId) return
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Habilita el acceso a la cámara en Ajustes.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    await runAction(
      'addPhoto',
      async () => {
        const uploaded = await uploadsApi.uploadImage(result.assets[0].uri, 'maintenance')
        await maintenanceApi.addPhoto(ticketId, { url: uploaded.url, isAfterPhoto: isAfter })
      },
      isAfter ? 'Foto "después" añadida' : 'Foto añadida',
    )
  }

  // Solo bloqueamos con full-screen loader la PRIMERA carga (sin data aún).
  // Refreshes post-acción/SSE NO ocultan el contenido. Bug B3 fix.
  if (isLoading && !ticket) {
    return (
      <SafeAreaView style={styles.canvas}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.brand[500]} size="large" />
        </View>
      </SafeAreaView>
    )
  }
  if (error && !ticket) {
    return (
      <SafeAreaView style={styles.canvas}>
        <View style={styles.loaderWrap}>
          <Text style={styles.errorTitle}>No se pudo cargar el ticket</Text>
          <Text style={styles.errorBody}>{error?.message ?? 'Ticket no encontrado'}</Text>
          <Pressable onPress={() => router.back()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }
  if (!ticket) return null // type-narrowing guard

  const priorityColor = PRIORITY_HEX[ticket.priority]
  const aging = estimateAging(ticket.estimatedEndAt, ticket.status)
  const statusColors = STATUS_COLOR[ticket.status]
  const contextLabel = ticket.roomNumber
    ? `Hab. ${ticket.roomNumber}`
    : ticket.assetTag
    ? `🔧 ${ticket.assetTag}`
    : '📍 Área general'

  return (
    <SafeAreaView style={styles.canvas} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.headerBack}>← Volver</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{ticket.friendlyId}</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Identity zone */}
        <View style={[styles.priorityCard, { borderLeftColor: priorityColor }]}>
          <View style={styles.identityRow}>
            <View style={[styles.priorityPill, { backgroundColor: PRIORITY_BG[ticket.priority] }]}>
              <Text style={[styles.priorityText, { color: PRIORITY_HEX_DARK[ticket.priority] }]}>
                {PRIORITY_LABEL[ticket.priority]}
              </Text>
            </View>
            <Text style={styles.categoryText}>
              {CATEGORY_EMOJI[ticket.category]} {CATEGORY_LABEL[ticket.category]}
            </Text>
            <View style={{ flex: 1 }} />
            {/* B5 — status pill con color semántico (no más gris uniforme) */}
            <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
              <Text style={[styles.statusPillText, { color: statusColors.fg }]}>
                {STATUS_LABEL[ticket.status]}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{ticket.title}</Text>
          <Text style={styles.context}>{contextLabel}</Text>
          {ticket.description ? (
            <Text style={styles.description}>{ticket.description}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Reportado por: {ticket.reportedByName ?? '—'}
            </Text>
            <Text style={styles.metaText}>· hace {formatElapsed(ticket.createdAt)}</Text>
          </View>
          {ticket.assignedToName && (
            <Text style={styles.metaText}>👤 Asignado: {ticket.assignedToName}</Text>
          )}
          {/* Aging chip stand-alone solo cuando NO hay banner OOO — si hay banner,
              el aging se muestra dentro del banner (B6 fix). */}
          {aging && !ticket.hasAutoBlock && (
            <View style={[styles.agingChip, { backgroundColor: AGING_HEX[aging.color].bg }]}>
              <Text style={[styles.agingText, { color: AGING_HEX[aging.color].fg }]}>
                ⏱ {aging.label}
              </Text>
            </View>
          )}
        </View>

        {/* B6 — Banner OOO consolida aging + mención Channex.
            Antes solo decía "se libera al verificar"; ahora muestra ETA real +
            sync con OTAs (diferenciador competitivo §29 + §30 CLAUDE.md). */}
        {ticket.hasAutoBlock && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>🔒 Habitación fuera de venta</Text>
            <Text style={styles.bannerBody}>
              Cerrada también en OTAs (Booking, Airbnb, Expedia) mientras el ticket
              esté abierto. Se libera automáticamente al verificar la resolución.
            </Text>
            {aging && (
              <View style={[styles.bannerAgingChip, { backgroundColor: AGING_HEX[aging.color].bg }]}>
                <Text style={[styles.bannerAgingText, { color: AGING_HEX[aging.color].fg }]}>
                  ⏱ {aging.label}
                </Text>
              </View>
            )}
          </View>
        )}

        {ticket.requiresApproval && ticket.pendingApproval && (
          <View style={[styles.banner, styles.bannerAmber]}>
            <Text style={styles.bannerTitle}>🟡 Esperando aprobación</Text>
            <Text style={styles.bannerBody}>
              {isSupervisor
                ? 'Decide si este ticket procede para asignación.'
                : 'El supervisor de mantenimiento revisará este reporte pronto.'}
            </Text>
          </View>
        )}

        {/* Photos (Mx-1B-W2) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              Evidencia {ticket.photos.length > 0 && `(${ticket.photos.length})`}
            </Text>
            <View style={styles.photoActionRow}>
              <Pressable
                onPress={() => onAddPhoto(false)}
                disabled={actionLoading === 'addPhoto'}
                style={styles.photoActionBtn}
              >
                <Text style={styles.photoActionText}>📷 Antes</Text>
              </Pressable>
              <Pressable
                onPress={() => onAddPhoto(true)}
                disabled={actionLoading === 'addPhoto'}
                style={[styles.photoActionBtn, styles.photoActionBtnAfter]}
              >
                <Text style={[styles.photoActionText, styles.photoActionTextAfter]}>
                  ✓ Después
                </Text>
              </Pressable>
            </View>
          </View>
          {ticket.photos.length === 0 ? (
            <Text style={styles.sectionHint}>
              Toca "Antes" o "Después" para tomar una foto y adjuntarla al ticket.
            </Text>
          ) : (
            <View style={styles.photoGrid}>
              {ticket.photos.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPhotoLightboxUrl(resolveImageUrl(p.url))}
                  style={styles.photoTile}
                >
                  <Image
                    source={{ uri: resolveImageUrl(p.url) }}
                    style={styles.photoImg}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoTileLabel}>
                    {p.isAfterPhoto ? '✓ Después' : 'Antes'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Comments (Mx-1B-W2 — composer + thread) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Comentarios {ticket.comments.length > 0 && `(${ticket.comments.length})`}
          </Text>
          {ticket.comments.map((c) => (
            <View key={c.id} style={styles.commentCard}>
              <Text style={styles.commentAuthor}>{c.authorName ?? 'Sistema'}</Text>
              <Text style={styles.commentBody}>{c.content}</Text>
              <Text style={styles.commentTime}>hace {formatElapsed(c.createdAt)}</Text>
            </View>
          ))}
          <View style={styles.commentComposer}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Escribe un comentario…"
              placeholderTextColor={colors.text.tertiary}
              style={styles.commentInput}
              multiline
              maxLength={1000}
            />
            <Pressable
              onPress={onSubmitComment}
              disabled={!commentDraft.trim() || actionLoading === 'comment'}
              style={[
                styles.commentSendBtn,
                (!commentDraft.trim() || actionLoading === 'comment') && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.commentSendText}>
                {actionLoading === 'comment' ? '…' : 'Enviar'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Acciones contextuales según estado */}
        <View style={styles.actionsWrap}>
          {/* SUPERVISOR + OPEN pendiente aprobación */}
          {isSupervisor && ticket.status === 'OPEN' && ticket.pendingApproval && (
            <>
              <ActionBtn
                label="✓ Aprobar"
                onPress={onApprove}
                loading={actionLoading === 'approve'}
                tone="primary"
              />
              <ActionBtn
                label="✗ Rechazar reporte"
                onPress={onReject}
                loading={actionLoading === 'reject'}
                tone="danger"
              />
            </>
          )}

          {/* Cualquier técnico mantenimiento → claim si OPEN sin asignar */}
          {(isMaintenance || isSupervisor) &&
            ticket.status === 'OPEN' &&
            !ticket.assignedToId &&
            !ticket.pendingApproval && (
              <ActionBtn
                label="✋ Tomar este ticket"
                onPress={onClaim}
                loading={actionLoading === 'claim'}
                tone="primary"
              />
            )}

          {/* Asignado a mí + ACKNOWLEDGED → Iniciar */}
          {isMine && ticket.status === 'ACKNOWLEDGED' && (
            <ActionBtn
              label="▶ Iniciar trabajo"
              onPress={onStart}
              loading={actionLoading === 'start'}
              tone="primary"
            />
          )}

          {/* Asignado a mí + IN_PROGRESS → Resolver / Esperar piezas */}
          {isMine && ticket.status === 'IN_PROGRESS' && (
            <>
              <Text style={styles.label}>Resumen de la resolución</Text>
              <TextInput
                style={styles.input}
                value={resolutionNote}
                onChangeText={setResolutionNote}
                placeholder="Qué hiciste, qué quedó, recomendaciones…"
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={3}
              />
              <ActionBtn
                label="✓ Marcar resuelto"
                onPress={onResolve}
                loading={actionLoading === 'resolve'}
                tone="primary"
              />
              <ActionBtn
                label="⏸ Esperar piezas"
                onPress={onRequestParts}
                loading={actionLoading === 'requestParts'}
                tone="secondary"
              />
            </>
          )}

          {/* Asignado a mí + WAITING_PARTS → Reanudar */}
          {isMine && ticket.status === 'WAITING_PARTS' && (
            <ActionBtn
              label="▶ Reanudar"
              onPress={onResume}
              loading={actionLoading === 'resume'}
              tone="primary"
            />
          )}

          {/* SUPERVISOR + RESOLVED → Verificar / Rechazar calidad (B2) */}
          {isSupervisor && ticket.status === 'RESOLVED' && (
            <>
              <ActionBtn
                label="✓ Verificar resolución"
                onPress={onVerify}
                loading={actionLoading === 'verify'}
                tone="primary"
              />
              <ActionBtn
                label="↩ Rechazar calidad · reabrir"
                onPress={onVerifyReject}
                loading={actionLoading === 'verify-reject'}
                tone="danger"
              />
            </>
          )}
        </View>

        {/* Historial breve */}
        {ticket.logs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Historial</Text>
            {ticket.logs.slice(-6).reverse().map((l) => (
              <View key={l.id} style={styles.logRow}>
                <Text style={styles.logEvent}>{l.event}</Text>
                <Text style={styles.logActor}>
                  {l.staffName ?? 'sistema'} · hace {formatElapsed(l.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* B1/B2 — Modal in-app cross-platform de razón.
          Sustituye al Alert.prompt iOS-only que dejaba a Android sin entrada. */}
      <Modal
        visible={!!reasonPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonPrompt(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {reasonPrompt?.kind === 'verify-reject'
                ? '↩ Rechazar calidad'
                : '✗ Rechazar reporte'}
            </Text>
            <Text style={styles.modalBody}>
              {reasonPrompt?.kind === 'verify-reject'
                ? 'El ticket regresará a IN_PROGRESS con tu razón visible para el técnico.'
                : 'El reporte se cierra y el housekeeper recibe la razón por push.'}
            </Text>
            <TextInput
              autoFocus
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Mínimo 5 caracteres…"
              placeholderTextColor={colors.text.tertiary}
              style={styles.modalInput}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
            <Text style={styles.modalHint}>{reasonText.length}/300</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setReasonPrompt(null)}
                style={[styles.modalBtn, styles.modalBtnSecondary]}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={onConfirmReason}
                style={[styles.modalBtn, styles.modalBtnDanger]}
              >
                <Text style={styles.modalBtnDangerText}>
                  {reasonPrompt?.kind === 'verify-reject' ? 'Rechazar y reabrir' : 'Rechazar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Lightbox de fotos (Mx-1B-W2) */}
      <Modal
        visible={!!photoLightboxUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoLightboxUrl(null)}
      >
        <Pressable
          style={styles.lightboxBackdrop}
          onPress={() => setPhotoLightboxUrl(null)}
        >
          {photoLightboxUrl && (
            <Image
              source={{ uri: photoLightboxUrl }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          )}
          <Pressable
            onPress={() => setPhotoLightboxUrl(null)}
            style={styles.lightboxClose}
          >
            <Text style={styles.lightboxCloseText}>×</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function ActionBtn({
  label,
  onPress,
  loading,
  tone,
}: {
  label: string
  onPress: () => void
  loading?: boolean
  tone: 'primary' | 'secondary' | 'danger'
}) {
  const style =
    tone === 'primary' ? styles.btnPrimary : tone === 'danger' ? styles.btnDanger : styles.btnSecondary
  const textStyle =
    tone === 'primary'
      ? styles.btnPrimaryText
      : tone === 'danger'
      ? styles.btnDangerText
      : styles.btnSecondaryText
  return (
    <Pressable disabled={loading} onPress={onPress} style={[style, loading && { opacity: 0.6 }]}>
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? colors.text.inverse : '#fff'} />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '600' },
  errorBody: { color: colors.text.secondary, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.text.inverse, fontWeight: '600', fontSize: 14 },
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
  headerTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  priorityCard: {
    backgroundColor: colors.canvas.secondary,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderTopColor: colors.border.subtle,
    borderRightColor: colors.border.subtle,
    borderBottomColor: colors.border.subtle,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  priorityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  categoryText: { fontSize: 12, color: colors.text.tertiary },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  context: { fontSize: 13, color: colors.text.secondary, marginBottom: 8 },
  description: { fontSize: 13, color: colors.text.secondary, lineHeight: 19, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  metaText: { fontSize: 12, color: colors.text.tertiary },
  agingChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  agingText: { fontSize: 12, fontWeight: '600' },
  banner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    marginBottom: 10,
  },
  bannerAmber: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  bannerTitle: { fontSize: 13, fontWeight: '600', color: colors.text.primary },
  bannerBody: { fontSize: 12, color: colors.text.secondary, marginTop: 4, lineHeight: 17 },
  bannerAgingChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 5,
  },
  bannerAgingText: { fontSize: 11, fontWeight: '700' },
  section: { marginTop: 16 },
  sectionLabel: { color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  sectionHint: { color: colors.text.tertiary, fontSize: 11, fontStyle: 'italic' },
  commentCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  commentAuthor: { color: colors.text.primary, fontSize: 12, fontWeight: '600' },
  commentBody: { color: colors.text.secondary, fontSize: 13, marginTop: 2 },
  commentTime: { color: colors.text.tertiary, fontSize: 10, marginTop: 4 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  logEvent: { color: colors.text.secondary, fontSize: 12, fontFamily: 'monospace' },
  logActor: { color: colors.text.tertiary, fontSize: 11 },
  actionsWrap: { marginTop: 16, gap: 10 },
  label: { color: colors.text.primary, fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 6,
  },
  btnPrimary: {
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: colors.text.inverse, fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: colors.canvas.secondary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  btnSecondaryText: { color: colors.text.primary, fontWeight: '600', fontSize: 14 },
  btnDanger: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.40)',
  },
  btnDangerText: { color: '#FCA5A5', fontWeight: '700', fontSize: 14 },
  // ── Modal de razón (B1/B2)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '700' },
  modalBody: { color: colors.text.secondary, fontSize: 13, marginTop: 6, lineHeight: 18 },
  modalInput: {
    marginTop: 12,
    minHeight: 80,
    backgroundColor: colors.canvas.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalHint: { color: colors.text.tertiary, fontSize: 11, textAlign: 'right', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnSecondary: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalBtnSecondaryText: { color: colors.text.primary, fontWeight: '600', fontSize: 14 },
  modalBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  modalBtnDangerText: { color: '#FCA5A5', fontWeight: '700', fontSize: 14 },
  // ── Photos (Mx-1B-W2)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  photoActionRow: { flexDirection: 'row', gap: 6 },
  photoActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  photoActionBtnAfter: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.30)',
  },
  photoActionText: { color: colors.text.secondary, fontSize: 11, fontWeight: '600' },
  photoActionTextAfter: { color: colors.brand[300] },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: {
    width: '48%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  photoImg: { width: '100%', height: 100 },
  photoTileLabel: {
    fontSize: 10,
    color: colors.text.secondary,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  // ── Comment composer (Mx-1B-W2)
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text.primary,
    fontSize: 13,
    minHeight: 40,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  commentSendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.brand[500],
    borderRadius: 10,
  },
  commentSendText: { color: colors.text.inverse, fontSize: 13, fontWeight: '700' },
  // ── Lightbox (Mx-1B-W2)
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: { width: '100%', height: '100%' },
  lightboxClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: { color: '#fff', fontSize: 20, lineHeight: 22 },
})
