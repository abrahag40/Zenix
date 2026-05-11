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
import { typography } from '../../../design/typography'
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
  // Apple HIG: padding 16-18pt, body 15pt, Footnote 13pt, Caption 11pt
  card: {
    backgroundColor: colors.canvas.secondary,
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderTopColor: colors.border.subtle,
    borderRightColor: colors.border.subtle,
    borderBottomColor: colors.border.subtle,
  },
  cardPressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  priorityPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5 },
  priorityText: {
    fontSize: typography.size.micro, // 11pt Caption
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryText: { fontSize: typography.size.small, color: colors.text.tertiary, fontWeight: '500' },
  friendlyId: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  title: {
    fontSize: typography.size.bodyLg, // 17pt Headline
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 22,
    marginBottom: 4,
  },
  context: { fontSize: typography.size.small, color: colors.text.secondary, marginBottom: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignee: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: '500',
    maxWidth: 140,
  },
  unassigned: { fontSize: typography.size.small, color: colors.text.tertiary, fontStyle: 'italic' },
  agingChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  agingText: { fontSize: typography.size.micro, fontWeight: '600' },
  elapsed: { fontSize: typography.size.micro, color: colors.text.tertiary },
  blockBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  blockBannerText: { fontSize: typography.size.small, color: '#FCA5A5', fontWeight: '500' },
  approvalBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  approvalBannerText: { fontSize: typography.size.small, color: '#FBBF24', fontWeight: '500' },
})
