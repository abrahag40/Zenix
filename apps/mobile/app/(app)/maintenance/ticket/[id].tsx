/**
 * /maintenance/ticket/[id] — detalle de ticket (Sprint Mx-1B-M).
 *
 * Acciones inline según rol y estado actual:
 *   - SUPERVISOR sobre OPEN pendingApproval → Aprobar / Rechazar
 *   - Cualquier técnico sobre OPEN sin asignar → ✋ Tomar este ticket
 *   - Asignado sobre ACKNOWLEDGED → ▶ Iniciar
 *   - Asignado sobre IN_PROGRESS → ✓ Resolver / ⏸ Esperar piezas
 *   - Asignado sobre WAITING_PARTS → ▶ Reanudar
 *   - SUPERVISOR sobre RESOLVED → ✓ Verificar / ↩ Rechazar
 *
 * Cada acción dispara API call → SSE → useMaintenanceTicket refetch automático.
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../../../src/store/auth'
import {
  useMaintenanceTicket,
} from '../../../../src/features/maintenance/api/useTickets'
import { maintenanceApi } from '../../../../src/features/maintenance/api/maintenance.api'
import { colors } from '../../../../src/design/colors'
import {
  AGING_HEX,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  PRIORITY_BG,
  PRIORITY_HEX,
  PRIORITY_HEX_DARK,
  PRIORITY_LABEL,
  STATUS_LABEL,
  estimateAging,
  formatElapsed,
} from '../../../../src/features/maintenance/utils/constants'

export default function TicketDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const ticketId = typeof id === 'string' ? id : null
  const user = useAuthStore((s) => s.user)
  const { data: ticket, isLoading, error, refetch } = useMaintenanceTicket(ticketId)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')

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

  function onReject() {
    if (!ticketId) return
    Alert.prompt?.(
      'Rechazar ticket',
      'Razón breve del rechazo:',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: (reason?: string) => {
            if (!reason || reason.trim().length < 3) {
              Alert.alert('Razón requerida', 'Mínimo 3 caracteres.')
              return
            }
            void runAction(
              'reject',
              () => maintenanceApi.reject(ticketId, { reason: reason.trim() }),
              'Ticket rechazado',
            )
          },
        },
      ],
      'plain-text',
    ) ??
      // Android fallback (Alert.prompt no existe en Android)
      runAction(
        'reject',
        () => maintenanceApi.reject(ticketId, { reason: 'Rechazado desde mobile' }),
        'Ticket rechazado',
      )
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.canvas}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.brand[500]} size="large" />
        </View>
      </SafeAreaView>
    )
  }
  if (error || !ticket) {
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

  const priorityColor = PRIORITY_HEX[ticket.priority]
  const aging = estimateAging(ticket.estimatedEndAt, ticket.status)
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
            <Text style={styles.statusPill}>{STATUS_LABEL[ticket.status]}</Text>
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
          {aging && (
            <View style={[styles.agingChip, { backgroundColor: AGING_HEX[aging.color].bg }]}>
              <Text style={[styles.agingText, { color: AGING_HEX[aging.color].fg }]}>
                ⏱ {aging.label}
              </Text>
            </View>
          )}
        </View>

        {/* Banners */}
        {ticket.hasAutoBlock && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>🔒 Habitación fuera de venta</Text>
            <Text style={styles.bannerBody}>
              El bloqueo se libera automáticamente al verificar la resolución.
            </Text>
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

        {/* Photos */}
        {ticket.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Evidencia ({ticket.photos.length})</Text>
            <Text style={styles.sectionHint}>
              Las fotos se cargan desde la web hasta que se active el upload mobile (Mx-1C).
            </Text>
          </View>
        )}

        {/* Comments */}
        {ticket.comments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Comentarios ({ticket.comments.length})</Text>
            {ticket.comments.map((c) => (
              <View key={c.id} style={styles.commentCard}>
                <Text style={styles.commentAuthor}>{c.authorName ?? 'Sistema'}</Text>
                <Text style={styles.commentBody}>{c.content}</Text>
                <Text style={styles.commentTime}>hace {formatElapsed(c.createdAt)}</Text>
              </View>
            ))}
          </View>
        )}

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
                label="✗ Rechazar"
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

          {/* SUPERVISOR + RESOLVED → Verificar */}
          {isSupervisor && ticket.status === 'RESOLVED' && (
            <ActionBtn
              label="✓ Verificar resolución"
              onPress={onVerify}
              loading={actionLoading === 'verify'}
              tone="primary"
            />
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
  statusPill: {
    fontSize: 11,
    color: colors.text.secondary,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  context: { fontSize: 13, color: colors.text.secondary, marginBottom: 8 },
  description: { fontSize: 13, color: colors.text.secondary, lineHeight: 19, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  metaText: { fontSize: 12, color: colors.text.tertiary },
  agingChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 10 },
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
  bannerBody: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
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
})
