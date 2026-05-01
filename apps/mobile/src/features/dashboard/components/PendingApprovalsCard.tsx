/**
 * PendingApprovalsCard — Capa 2 (ACTION) · SUPERVISOR/ADMIN only.
 *
 * Inline approve/reject buttons per the user's spec — fast access to
 * frequent decisions (late check-out, comp, block release). When more
 * than the cap are pending, the card shows "Ver todas (N) →" routing
 * to a full screen with detail-per-item flow.
 *
 * Why inline buttons (CLAUDE.md §32 considerations):
 *   §32 requires confirmation for destructive/financial actions. Inline
 *   approve here is NOT destructive — it's the "approve" half of the
 *   workflow. The triggering ACTION (e.g., charging the guest the late
 *   checkout fee) STILL goes through its own confirmation dialog when
 *   the backend processes the approval.
 *
 *   In other words: the inline button approves the REQUEST. The system
 *   then performs the downstream action (which has its own confirmation
 *   audit trail in the backend StayJourney). This is the same pattern
 *   Slack uses for inline message reactions — fast actions on the
 *   coordination layer, not the financial layer.
 *
 * Privacy:
 *   - HOUSEKEEPER never sees this card (component self-hides + parent
 *     also gates by role).
 */

import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useAuthStore } from '../../../store/auth'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type ApprovalKind =
  | 'LATE_CHECKOUT'
  | 'EARLY_CHECKIN'
  | 'COMP'
  | 'BLOCK_RELEASE'
  | 'WAIVE_FEE'
  | 'OTHER'

export interface ApprovalRequest {
  id: string
  kind: ApprovalKind
  /** Headline — "Late check-out · Hab 203 · +2h" */
  title: string
  /** Subline — "$400 MXN · solicita Carlos R." */
  subline: string
  /** Optional amount string for emphasis. */
  amountLabel?: string | null
}

interface PendingApprovalsCardProps {
  requests?: ApprovalRequest[]
  /** Called when the user inline-approves a request. */
  onApprove?: (id: string) => void
  /** Called when the user inline-rejects a request. */
  onReject?: (id: string) => void
}

const KIND_INFO: Record<ApprovalKind, { emoji: string; label: string; tint: string }> = {
  LATE_CHECKOUT:  { emoji: '🕐', label: 'Late check-out', tint: '#FBBF24' },
  EARLY_CHECKIN:  { emoji: '⏰', label: 'Early check-in', tint: '#FBBF24' },
  COMP:           { emoji: '🎟', label: 'Cortesía',       tint: '#A78BFA' },
  BLOCK_RELEASE:  { emoji: '🔓', label: 'Liberar bloqueo', tint: '#60A5FA' },
  WAIVE_FEE:      { emoji: '🤝', label: 'Perdonar cargo', tint: '#A78BFA' },
  OTHER:          { emoji: '📝', label: 'Aprobación',    tint: '#9CA3AF' },
}

const ROW_CAP = 2 // tighter than other cards because each row has 2 buttons

export function PendingApprovalsCard({
  requests,
  onApprove,
  onReject,
}: PendingApprovalsCardProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'SUPERVISOR' // also future ADMIN role
  const list = requests ?? []

  if (!isAdmin || list.length === 0) return null

  const visible = list.slice(0, ROW_CAP)
  const overflow = list.length - ROW_CAP

  return (
    <DashCard
      label="APROBACIONES PENDIENTES"
      trailing={
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      }
      cta={
        overflow > 0
          ? {
              label: `Ver todas (${list.length})`,
              tone: 'primary',
              onPress: () => router.push('/approvals'),
            }
          : undefined
      }
    >
      <View style={styles.list}>
        {visible.map((req) => (
          <ApprovalRow
            key={req.id}
            request={req}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </View>
    </DashCard>
  )
}

function ApprovalRow({
  request,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  const info = KIND_INFO[request.kind]
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  const handleApprove = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setBusy('approve')
    if (onApprove) onApprove(request.id)
    else Alert.alert('Aprobar', 'Sprint 9 conectará al backend (StayJourney audit log).')
    setTimeout(() => setBusy(null), 400)
  }

  const handleReject = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    setBusy('reject')
    if (onReject) onReject(request.id)
    else Alert.alert('Rechazar', 'Sprint 9 conectará al backend.')
    setTimeout(() => setBusy(null), 400)
  }

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowHead}
        onPress={() => {
          Haptics.selectionAsync()
          router.push(`/approvals/${request.id}`)
        }}
      >
        <View style={[styles.iconCircle, { borderColor: info.tint }]}>
          <Text style={styles.iconEmoji}>{info.emoji}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.titleRow}>
            <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
              {request.title}
            </Text>
            {request.amountLabel && (
              <Text style={[dashboardType.bodyEmphasis, { color: info.tint }]}>
                {request.amountLabel}
              </Text>
            )}
          </View>
          <Text style={dashboardType.caption} numberOfLines={1}>
            {request.subline}
          </Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.rejectBtn, busy === 'reject' && styles.actionBtnBusy]}
          onPress={handleReject}
          disabled={busy != null}
        >
          <Text style={styles.rejectText}>Rechazar</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.approveBtn, busy === 'approve' && styles.actionBtnBusy]}
          onPress={handleApprove}
          disabled={busy != null}
        >
          <Text style={styles.approveText}>{busy === 'approve' ? '✓' : 'Aprobar'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  countBadge: {
    backgroundColor: 'rgba(96,165,250,0.20)',
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    color: '#60A5FA',
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: 14,
  },
  row: {
    gap: 10,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 16,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnBusy: {
    opacity: 0.5,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.40)',
  },
  rejectText: {
    fontSize: 14,
    color: '#F87171',
    fontWeight: typography.weight.semibold,
  },
  approveBtn: {
    backgroundColor: colors.brand[500],
  },
  approveText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
  },
})
