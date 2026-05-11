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

import { useState, useEffect } from 'react'
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
import { typography } from '../../../../src/design/typography'
import { humanizeLogEvent } from '../../../../src/features/maintenance/utils/humanize'
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

  // Bug T-12 fix — al cambiar de ticket (mismo screen route, distinto param),
  // reseteamos drafts locales para no arrastrar texto del ticket anterior.
  useEffect(() => {
    setResolutionNote('')
    setCommentDraft('')
    setReasonPrompt(null)
    setReasonText('')
    setPhotoLightboxUrl(null)
  }, [ticketId])

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
  // Bug T-10 — al verificar el ticket pasa a VERIFIED → desaparece del Hub
  // (activeOnly=true). Mostramos confirmation explícita y navegamos a Mi día.
  function onVerify() {
    if (!ticketId) return
    void runAction(
      'verify',
      async () => {
        await maintenanceApi.verify(ticketId, { approved: true })
        // Pequeño delay para que el supervisor vea la confirmación de
        // estado antes de salir del detail.
        setTimeout(() => router.replace('/(app)/trabajo'), 800)
      },
      'Verificado · Habitación regresa a venta · Ticket archivado',
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
    if (!ticketId || !ticket) return
    // W2-03 guard: hard limit 3 fotos (forensic three-shot rule).
    if (ticket.photos.length >= 3) {
      Alert.alert(
        'Límite de fotos',
        'Máximo 3 fotos por ticket. Elimina una antes de subir otra.',
      )
      return
    }
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
    const asset = result.assets[0]
    await runAction(
      'addPhoto',
      async () => {
        const uploaded = await uploadsApi.uploadImage(asset.uri, 'maintenance', asset.fileSize ?? null)
        await maintenanceApi.addPhoto(ticketId, { url: uploaded.url, isAfterPhoto: isAfter })
      },
      isAfter ? 'Foto "después" añadida' : 'Foto añadida',
    )
  }

  // W2-04: eliminar foto desde mobile.
  async function onDeletePhoto(photoId: string) {
    if (!ticketId) return
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Eliminar foto',
        'Queda en histórico 30 días por si la necesitas recuperar.',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
        ],
      )
    })
    if (!ok) return
    await runAction(
      'deletePhoto',
      () => maintenanceApi.deletePhoto(ticketId, photoId),
      'Foto eliminada',
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
        {/* Bug T-8 — `router.back()` puede ir al dashboard si la navegación
            previa fue tab-switch (replace semantics). `router.replace` al
            Mi día garantiza destino consistente. */}
        <Pressable
          onPress={() => router.replace('/(app)/trabajo')}
          hitSlop={10}
        >
          <Text style={styles.headerBack}>← Mi día</Text>
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
          {/* Bug T-3 — el usuario no veía que el detalle podía estar vacío.
              Si hay descripción, la mostramos. Si no, placeholder explícito. */}
          {ticket.description ? (
            <Text style={styles.description}>{ticket.description}</Text>
          ) : (
            <Text style={styles.descriptionEmpty}>
              Sin descripción adicional
            </Text>
          )}

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

        {/* Photos (Mx-1B-W2 + audit fixes W2-03/04/11 + testing T-2/T-4) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            {/* T-4 — etiqueta explícita "0 de 3 fotos" en vez de "0/3" ambiguo */}
            <Text style={styles.sectionLabel}>
              Evidencia · {ticket.photos.length} de 3 fotos
            </Text>
          </View>
          <View style={styles.photoActionRowWide}>
            {/* T-2 — labels más semánticos. Una foto puede existir sin
                contraparte ("solo trabajo terminado" es válido). */}
            <Pressable
              onPress={() => onAddPhoto(false)}
              disabled={actionLoading === 'addPhoto' || ticket.photos.length >= 3}
              style={[
                styles.photoActionBtnWide,
                ticket.photos.length >= 3 && styles.photoActionBtnDisabled,
              ]}
            >
              <Text style={styles.photoActionText}>📷 Foto del problema</Text>
            </Pressable>
            <Pressable
              onPress={() => onAddPhoto(true)}
              disabled={actionLoading === 'addPhoto' || ticket.photos.length >= 3}
              style={[
                styles.photoActionBtnWide,
                styles.photoActionBtnAfter,
                ticket.photos.length >= 3 && styles.photoActionBtnDisabled,
              ]}
            >
              <Text style={[styles.photoActionText, styles.photoActionTextAfter]}>
                ✅ Trabajo terminado
              </Text>
            </Pressable>
          </View>
          {ticket.photos.length === 0 ? (
            <Text style={styles.sectionHint}>
              Adjunta hasta 3 fotos. Las del problema documentan el daño antes
              de la reparación; las del trabajo terminado dejan constancia de
              la calidad. No es obligatorio tener ambas.
            </Text>
          ) : (
            <View style={styles.photoGrid}>
              {ticket.photos.map((p) => {
                const canDelete = isSupervisor || p.uploadedById === user?.id
                return (
                  <View key={p.id} style={styles.photoTile}>
                    <Pressable
                      onPress={() => setPhotoLightboxUrl(resolveImageUrl(p.url))}
                    >
                      <Image
                        source={{ uri: resolveImageUrl(p.url) }}
                        style={styles.photoImg}
                        resizeMode="cover"
                      />
                      <Text style={styles.photoTileLabel}>
                        {p.isAfterPhoto ? '✅ Trabajo terminado' : '📷 Problema'}
                      </Text>
                    </Pressable>
                    {canDelete && (
                      <Pressable
                        onPress={() => onDeletePhoto(p.id)}
                        style={styles.photoDeleteBtn}
                        hitSlop={6}
                      >
                        <Text style={styles.photoDeleteBtnText}>🗑</Text>
                      </Pressable>
                    )}
                  </View>
                )
              })}
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

        {/* Historial (T-5 fix — humanizado, no enum raw) */}
        {ticket.logs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Historial</Text>
            {ticket.logs.slice(-6).reverse().map((l) => (
              <View key={l.id} style={styles.logRow}>
                <Text style={styles.logEvent}>{humanizeLogEvent(l.event)}</Text>
                <Text style={styles.logActor}>
                  {l.staffName ?? 'Sistema'} · hace {formatElapsed(l.createdAt)}
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

// ── Estilos — Apple HIG (testing T-6/T-9 fix):
//   · 8pt grid base · body 15pt · headline 17pt semibold
//   · card padding 16-20pt · section gap 20-24pt
//   · touch targets ≥44pt
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '600' },
  errorBody: { color: colors.text.secondary, fontSize: typography.size.body, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: colors.text.inverse, fontWeight: '600', fontSize: typography.size.body },
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
  headerTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '700', fontFamily: 'monospace' },
  scrollContent: { padding: 20, paddingBottom: 56 },
  priorityCard: {
    backgroundColor: colors.canvas.secondary,
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderTopColor: colors.border.subtle,
    borderRightColor: colors.border.subtle,
    borderBottomColor: colors.border.subtle,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  priorityPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  priorityText: { fontSize: typography.size.micro, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryText: { fontSize: typography.size.small, color: colors.text.tertiary },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  statusPillText: { fontSize: typography.size.micro, fontWeight: '700', letterSpacing: 0.3 },
  title: {
    fontSize: 22, // Title 2 Apple HIG
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 6,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  context: { fontSize: typography.size.body, color: colors.text.secondary, marginBottom: 12 },
  description: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  descriptionEmpty: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  metaText: { fontSize: typography.size.small, color: colors.text.tertiary },
  agingChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    marginTop: 12,
  },
  agingText: { fontSize: typography.size.small, fontWeight: '600' },
  banner: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    marginBottom: 14,
  },
  bannerAmber: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  bannerTitle: { fontSize: typography.size.body, fontWeight: '600', color: colors.text.primary },
  bannerBody: { fontSize: typography.size.small, color: colors.text.secondary, marginTop: 5, lineHeight: 19 },
  bannerAgingChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bannerAgingText: { fontSize: typography.size.micro, fontWeight: '700' },
  section: { marginTop: 24 },
  sectionLabel: {
    color: colors.text.primary,
    fontSize: typography.size.bodyLg, // Headline 17pt
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionHint: {
    color: colors.text.tertiary,
    fontSize: typography.size.small,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  commentCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  commentAuthor: { color: colors.text.primary, fontSize: typography.size.small, fontWeight: '600' },
  commentBody: { color: colors.text.secondary, fontSize: typography.size.body, marginTop: 4, lineHeight: 22 },
  commentTime: { color: colors.text.tertiary, fontSize: typography.size.micro, marginTop: 6 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: 12,
  },
  logEvent: { color: colors.text.primary, fontSize: typography.size.small, flex: 1 },
  logActor: { color: colors.text.tertiary, fontSize: typography.size.micro, textAlign: 'right' },
  actionsWrap: { marginTop: 24, gap: 12 },
  label: { color: colors.text.primary, fontSize: typography.size.body, fontWeight: '600', marginTop: 12, marginBottom: 8 },
  input: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  btnPrimary: {
    backgroundColor: colors.brand[500],
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: colors.text.inverse, fontWeight: '700', fontSize: typography.size.bodyLg },
  btnSecondary: {
    backgroundColor: colors.canvas.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  btnSecondaryText: { color: colors.text.primary, fontWeight: '600', fontSize: typography.size.body },
  btnDanger: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.40)',
  },
  btnDangerText: { color: '#FCA5A5', fontWeight: '700', fontSize: typography.size.body },
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
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '700' },
  modalBody: { color: colors.text.secondary, fontSize: typography.size.body, marginTop: 8, lineHeight: 22 },
  modalInput: {
    marginTop: 14,
    minHeight: 100,
    backgroundColor: colors.canvas.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
    textAlignVertical: 'top',
  },
  modalHint: { color: colors.text.tertiary, fontSize: typography.size.micro, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnSecondary: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalBtnSecondaryText: { color: colors.text.primary, fontWeight: '600', fontSize: typography.size.body },
  modalBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  modalBtnDangerText: { color: '#FCA5A5', fontWeight: '700', fontSize: typography.size.body },
  // ── Photos (Mx-1B-W2 + testing T-2/T-4 fixes)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  // T-2: botones full-width separados — más espacio para labels semánticos
  photoActionRowWide: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  photoActionBtnWide: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12, // 44pt touch target
    borderRadius: 10,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
  },
  photoActionBtnAfter: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.30)',
  },
  photoActionBtnDisabled: { opacity: 0.4 },
  photoDeleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteBtnText: { color: '#fff', fontSize: 15 },
  photoActionText: { color: colors.text.secondary, fontSize: typography.size.small, fontWeight: '600' },
  photoActionTextAfter: { color: colors.brand[300] },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  photoImg: { width: '100%', height: 110 },
  photoTileLabel: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  // ── Comment composer
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: typography.size.body,
    minHeight: 44, // 44pt touch target
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  commentSendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.brand[500],
    borderRadius: 12,
  },
  commentSendText: { color: colors.text.inverse, fontSize: typography.size.body, fontWeight: '700' },
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
