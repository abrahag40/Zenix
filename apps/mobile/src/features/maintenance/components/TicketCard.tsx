/**
 * TicketCard — card de ticket para el Hub mobile (Sprint Mx-1B-M).
 *
 * Diseño dark-canvas alineado con HousekeepingHub (CLAUDE.md §13b):
 *   · Border-left 4px por priority (Treisman pre-attentive)
 *   · 3-zonas: identity (priority pill + categoría + friendlyId) /
 *     contenido (título + contexto) /
 *     footer (asignado + aging chip + tiempo)
 *   · Tap full → onPress (a TicketDetail)
 *   · Apple HIG: 44pt min touch target
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MaintenanceTicketDto } from '@zenix/shared'
import { colors } from '../../../design/colors'
import {
  AGING_HEX,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  PRIORITY_BG,
  PRIORITY_HEX,
  PRIORITY_HEX_DARK,
  PRIORITY_LABEL,
  estimateAging,
  formatElapsed,
} from '../utils/constants'

interface Props {
  ticket: MaintenanceTicketDto
  onPress: (id: string) => void
}

export function TicketCard({ ticket, onPress }: Props) {
  const priorityColor = PRIORITY_HEX[ticket.priority]          // border-left saturated
  const priorityTextColor = PRIORITY_HEX_DARK[ticket.priority] // texto sobre pill dark
  const priorityBg = PRIORITY_BG[ticket.priority]
  const aging = estimateAging(ticket.estimatedEndAt, ticket.status)
  const contextLabel = ticket.roomNumber
    ? `Hab. ${ticket.roomNumber}`
    : ticket.assetTag
    ? `🔧 ${ticket.assetTag}`
    : '📍 Área general'

  return (
    <Pressable
      onPress={() => onPress(ticket.id)}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: priorityColor },
        pressed && styles.cardPressed,
      ]}
    >
      {/* Zone 1 — Identity */}
      <View style={styles.row}>
        <View style={[styles.priorityPill, { backgroundColor: priorityBg }]}>
          <Text style={[styles.priorityText, { color: priorityTextColor }]}>
            {PRIORITY_LABEL[ticket.priority]}
          </Text>
        </View>
        <Text style={styles.categoryText}>
          {CATEGORY_EMOJI[ticket.category]} {CATEGORY_LABEL[ticket.category]}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.friendlyId}>{ticket.friendlyId}</Text>
      </View>

      {/* Zone 2 — Title + context */}
      <Text style={styles.title} numberOfLines={2}>
        {ticket.title}
      </Text>
      <Text style={styles.context}>{contextLabel}</Text>

      {/* Zone 3 — Footer */}
      <View style={styles.footer}>
        {ticket.assignedToName ? (
          <Text style={styles.assignee} numberOfLines={1}>
            👤 {ticket.assignedToName}
          </Text>
        ) : (
          <Text style={styles.unassigned}>Sin asignar</Text>
        )}
        <View style={{ flex: 1 }} />
        {aging && (
          <View
            style={[
              styles.agingChip,
              { backgroundColor: AGING_HEX[aging.color].bg },
            ]}
          >
            <Text style={[styles.agingText, { color: AGING_HEX[aging.color].fg }]}>
              {aging.label}
            </Text>
          </View>
        )}
        <Text style={styles.elapsed}>{formatElapsed(ticket.createdAt)}</Text>
      </View>

      {/* Banners de estado especial */}
      {ticket.hasAutoBlock && (
        <View style={styles.blockBanner}>
          <Text style={styles.blockBannerText}>🔒 Habitación fuera de venta</Text>
        </View>
      )}
      {ticket.requiresApproval && ticket.pendingApproval && (
        <View style={styles.approvalBanner}>
          <Text style={styles.approvalBannerText}>🟡 Esperando aprobación</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderTopColor: colors.border.subtle,
    borderRightColor: colors.border.subtle,
    borderBottomColor: colors.border.subtle,
  },
  cardPressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  priorityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  categoryText: { fontSize: 11, color: colors.text.tertiary, fontWeight: '500' },
  friendlyId: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: 3,
  },
  context: { fontSize: 12, color: colors.text.secondary, marginBottom: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assignee: { fontSize: 11, color: colors.text.secondary, fontWeight: '500', maxWidth: 140 },
  unassigned: { fontSize: 11, color: colors.text.tertiary, fontStyle: 'italic' },
  agingChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  agingText: { fontSize: 10, fontWeight: '600' },
  elapsed: { fontSize: 11, color: colors.text.tertiary },
  blockBanner: {
    marginTop: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  blockBannerText: { fontSize: 11, color: '#FCA5A5', fontWeight: '500' },
  approvalBanner: {
    marginTop: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  approvalBannerText: { fontSize: 11, color: '#FBBF24', fontWeight: '500' },
})
