/**
 * ReservationDetailHeader — top block of detail screen.
 *
 * Shows guest identity, status, dates, and quick-contact actions
 * (Call / WhatsApp / Email). Consistent with Hostaway/Cloudbeds detail.
 *
 * Privacy: guestPhone/Email may be null when the API redacts. The
 * action buttons hide themselves when the underlying field is missing —
 * no broken intents.
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { ReservationDetail, ReservationStatus } from '../types'

interface Props {
  reservation: ReservationDetail
  onCall: () => void
  onWhatsapp: () => void
  onEmail: () => void
}

const STATUS_BG: Record<ReservationStatus, string> = {
  UNCONFIRMED: 'rgba(245,158,11,0.15)',
  IN_HOUSE:    'rgba(16,185,129,0.15)',
  DEPARTING:   'rgba(59,130,246,0.15)',
  UPCOMING:    'rgba(255,255,255,0.06)',
  NO_SHOW:     'rgba(239,68,68,0.15)',
  DEPARTED:    'rgba(255,255,255,0.06)',
  CANCELLED:   'rgba(255,255,255,0.06)',
}
const STATUS_FG: Record<ReservationStatus, string> = {
  UNCONFIRMED: '#FBBF24',
  IN_HOUSE:    '#34D399',
  DEPARTING:   '#60A5FA',
  UPCOMING:    '#9CA3AF',
  NO_SHOW:     '#F87171',
  DEPARTED:    '#9CA3AF',
  CANCELLED:   '#9CA3AF',
}
const STATUS_LABEL: Record<ReservationStatus, string> = {
  UNCONFIRMED: 'Sin confirmar',
  IN_HOUSE:    'En casa',
  DEPARTING:   'Sale hoy',
  UPCOMING:    'Próxima',
  NO_SHOW:     'No-show',
  DEPARTED:    'Salió',
  CANCELLED:   'Cancelada',
}

function initials(name: string): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function ReservationDetailHeader({ reservation, onCall, onWhatsapp, onEmail }: Props) {
  const fg = STATUS_FG[reservation.status]
  const bg = STATUS_BG[reservation.status]

  return (
    <View style={styles.wrap}>
      {/* Identity block */}
      <View style={styles.identityRow}>
        <View style={[styles.avatar, { backgroundColor: bg, borderColor: fg }]}>
          <Text style={[styles.avatarText, { color: fg }]}>
            {initials(reservation.guestName)}
          </Text>
        </View>
        <View style={styles.identityBody}>
          <Text style={styles.guestName} numberOfLines={1}>
            {reservation.guestName}
          </Text>
          <View style={styles.metaLine}>
            <View style={[styles.statusChip, { backgroundColor: bg }]}>
              <View style={[styles.statusDot, { backgroundColor: fg }]} />
              <Text style={[styles.statusLabel, { color: fg }]}>
                {STATUS_LABEL[reservation.status]}
              </Text>
            </View>
            <Text style={styles.metaText} numberOfLines={1}>
              {reservation.roomNumber ? `Hab. ${reservation.roomNumber}` : '—'} ·{' '}
              {reservation.paxCount} pax
            </Text>
          </View>
          <Text style={styles.dateRange}>{reservation.dateRangeLabel}</Text>
        </View>
      </View>

      {/* Quick contact actions — only shown when data present (no PII redaction) */}
      {(reservation.guestPhone || reservation.guestEmail) && (
        <View style={styles.actionRow}>
          {reservation.guestPhone && (
            <Pressable style={styles.actionBtn} onPress={onCall}>
              <Text style={styles.actionEmoji}>📞</Text>
              <Text style={styles.actionLabel}>Llamar</Text>
            </Pressable>
          )}
          {reservation.guestPhone && (
            <Pressable style={styles.actionBtn} onPress={onWhatsapp}>
              <Text style={styles.actionEmoji}>💬</Text>
              <Text style={styles.actionLabel}>WhatsApp</Text>
            </Pressable>
          )}
          {reservation.guestEmail && (
            <Pressable style={styles.actionBtn} onPress={onEmail}>
              <Text style={styles.actionEmoji}>✉️</Text>
              <Text style={styles.actionLabel}>Email</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  identityBody: {
    flex: 1,
    gap: 4,
  },
  guestName: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
  metaText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },
  dateRange: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  actionEmoji: {
    fontSize: 18,
  },
  actionLabel: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wide,
  },
})
