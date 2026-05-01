/**
 * ApprovalDetailScreen — full context for a single approval request.
 *
 * Per the user's spec: when there are many pending, the list lives in a
 * dedicated screen and tapping a row routes here for full detail with
 * approve / reject buttons. This screen is the "high-context" companion
 * to the inline buttons on the dashboard card.
 *
 * Sprint 9 will wire the actual mutation (StayJourneyEvent log) and SSE
 * `notification:resolved` to remove the row across all clients.
 */

import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_APPROVALS,
} from '../../dashboard/__mocks__/mockDashboard'
import type { ApprovalRequest } from '../../dashboard/components/PendingApprovalsCard'

export function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const req: ApprovalRequest | undefined = MOCKS_DASHBOARD_ENABLED
    ? MOCK_APPROVALS.find((r) => r.id === id)
    : undefined

  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null)

  if (!req) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Aprobación no encontrada" />
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🔍</Text>
          <Text style={[dashboardType.titleLg, { textAlign: 'center' }]}>
            No disponible
          </Text>
          <Text style={[dashboardType.body, { color: colors.text.secondary, textAlign: 'center' }]}>
            La solicitud puede haber sido resuelta por otro usuario.
          </Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const handleApprove = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setResolved('approved')
    setTimeout(() => router.back(), 800)
  }

  const handleReject = () => {
    Alert.alert(
      'Rechazar solicitud',
      '¿Confirmar rechazo? Esta acción se registra en el historial de auditoría.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
            setResolved('rejected')
            setTimeout(() => router.back(), 800)
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Aprobación" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={dashboardType.sectionLabel}>SOLICITUD</Text>
          <Text style={[dashboardType.titleLg, { marginTop: 6 }]}>{req.title}</Text>
          <Text style={[dashboardType.body, { color: colors.text.secondary, marginTop: 4 }]}>
            {req.subline}
          </Text>
          {req.amountLabel && (
            <View style={styles.amountChip}>
              <Text style={styles.amountText}>{req.amountLabel}</Text>
            </View>
          )}
        </View>

        {resolved && (
          <View
            style={[
              styles.resolvedBanner,
              {
                backgroundColor:
                  resolved === 'approved'
                    ? 'rgba(16,185,129,0.12)'
                    : 'rgba(239,68,68,0.12)',
                borderColor:
                  resolved === 'approved' ? colors.brand[400] : '#F87171',
              },
            ]}
          >
            <Text
              style={[
                styles.resolvedText,
                { color: resolved === 'approved' ? colors.brand[400] : '#F87171' },
              ]}
            >
              {resolved === 'approved' ? '✓ Aprobado · cerrando...' : '✕ Rechazado · cerrando...'}
            </Text>
          </View>
        )}
      </ScrollView>

      {!resolved && (
        <View style={styles.actionBar}>
          <Pressable style={[styles.actionBtn, styles.rejectBtn]} onPress={handleReject}>
            <Text style={styles.rejectText}>Rechazar</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove}>
            <Text style={styles.approveText}>Aprobar</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas.primary },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 22 },
  hero: { paddingTop: 8 },
  amountChip: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: '#A78BFA',
  },
  amountText: {
    fontSize: 18,
    color: '#A78BFA',
    fontWeight: typography.weight.bold,
  },
  resolvedBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resolvedText: {
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  actionBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.canvas.primary,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.50)',
  },
  rejectText: {
    fontSize: 16, color: '#F87171', fontWeight: typography.weight.semibold,
  },
  approveBtn: {
    backgroundColor: colors.brand[500],
  },
  approveText: {
    fontSize: 16, color: '#FFFFFF', fontWeight: typography.weight.bold,
  },
  // Not found
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 10,
  },
  notFoundEmoji: { fontSize: 48 },
  backBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.15)',
  },
  backBtnText: {
    fontSize: 16, color: colors.brand[400], fontWeight: typography.weight.semibold,
  },
})
