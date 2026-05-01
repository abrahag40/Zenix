/**
 * ReservationDetailScreen — full-screen detail (Research #4 §5.2).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ ← back            Hab. 203                  │
 *   │                                              │
 *   │ ●●  María García                            │
 *   │     UNCONFIRMED · Booking · 2 pax           │
 *   │     Hoy 15:00 → Mañana 12:00                │
 *   │                                              │
 *   │ [Estadía] [Huésped] [Pagos] [Historial]     │  ← segmented
 *   │ ─────────────────────────────────────────── │
 *   │  ...content varies per tab...               │
 *   │                                              │
 *   ├─────────────────────────────────────────────┤
 *   │ [Confirmar check-in]              [⚠ no-show]│  ← bottom CTA bar
 *   └─────────────────────────────────────────────┘
 *
 * Design rationale:
 *   - Full-screen (no modal) — Apple HIG iOS pattern for detail views.
 *   - Tabs segmented control (Apple SegmentedControl pattern) — reduces
 *     vertical scroll fatigue, lets user jump to "Pagos" without scrolling.
 *   - Bottom CTA bar in thumb zone (Fitts + Hoober 2013).
 *   - Bottom CTA actions are CONTEXTUAL by status — never show "no-show"
 *     for an IN_HOUSE guest, never show "check-in" for a DEPARTED one.
 *
 * Privacy:
 *   - This route should not be reachable by HOUSEKEEPING/MAINTENANCE/etc.
 *     The list that links here is only rendered inside ReceptionHub.
 *   - If a malicious deep-link reaches here for a HK user, the API
 *     redacts PII — the screen renders with placeholder data, no leak.
 *
 * Data:
 *   - Sprint 8I: useReservationDetail() returns mock data.
 *   - Sprint 9: useQuery({ queryKey: ['reservation', id] }).
 */

import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useReservationDetail } from '../api/useReservations'
import { ReservationDetailHeader } from '../components/ReservationDetailHeader'
import { ReservationTabs, type DetailTab } from '../components/ReservationTabs'
import { StayTab } from '../components/tabs/StayTab'
import { GuestTab } from '../components/tabs/GuestTab'
import { PaymentsTab } from '../components/tabs/PaymentsTab'
import { HistoryTab } from '../components/tabs/HistoryTab'
import { BottomActionBar } from '../components/BottomActionBar'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useReservationDetail(id)
  const [tab, setTab] = useState<DetailTab>('stay')

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Reserva" />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Cargando reserva…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Reserva" />
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🪂</Text>
          <Text style={styles.notFoundTitle}>Reserva no encontrada</Text>
          <Text style={styles.notFoundBody}>
            No pudimos cargar los datos. Puede que la reserva haya sido cancelada
            o que no tengas permisos para verla.
          </Text>
          <Pressable
            style={styles.notFoundAction}
            onPress={() => router.back()}
          >
            <Text style={styles.notFoundActionText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Quick action handlers ──────────────────────────────────────
  const callGuest = () => {
    if (!data.guestPhone) return
    Linking.openURL(`tel:${data.guestPhone}`).catch(() =>
      Alert.alert('No se pudo abrir el marcador'),
    )
  }
  const whatsapp = () => {
    if (!data.guestPhone) return
    const phone = data.guestPhone.replace(/[^\d]/g, '')
    Linking.openURL(`https://wa.me/${phone}`).catch(() =>
      Alert.alert('WhatsApp no instalado'),
    )
  }
  const emailGuest = () => {
    if (!data.guestEmail) return
    Linking.openURL(`mailto:${data.guestEmail}`).catch(() =>
      Alert.alert('No se pudo abrir el correo'),
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={data.roomNumber ? `Hab. ${data.roomNumber}` : 'Reserva'}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ReservationDetailHeader
          reservation={data}
          onCall={callGuest}
          onWhatsapp={whatsapp}
          onEmail={emailGuest}
        />

        <ReservationTabs active={tab} onChange={setTab} />

        <View style={styles.tabContent}>
          {tab === 'stay'     && <StayTab reservation={data} />}
          {tab === 'guest'    && <GuestTab reservation={data} />}
          {tab === 'payments' && <PaymentsTab reservation={data} />}
          {tab === 'history'  && <HistoryTab reservation={data} />}
        </View>
      </ScrollView>

      <BottomActionBar
        reservation={data}
        onConfirmCheckin={() =>
          Alert.alert('Confirmar check-in', 'Sprint 9 conectará el flujo completo del PMS web.')
        }
        onMarkNoShow={() =>
          Alert.alert('Marcar no-show', 'Sprint 9 conectará el flujo del PMS web.')
        }
        onCheckout={() =>
          Alert.alert('Check-out', 'Sprint 9 conectará el flujo del PMS web.')
        }
        onEarlyCheckout={() =>
          Alert.alert('Salida anticipada', 'Sprint 9 conectará el flujo del PMS web.')
        }
        onRevertNoShow={() =>
          Alert.alert('Revertir no-show', 'Sprint 9 conectará el flujo del PMS web.')
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 110, // space for fixed bottom bar
    gap: 16,
  },
  tabContent: {
    minHeight: 200,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
  },
  notFoundEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  notFoundTitle: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  notFoundBody: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
  },
  notFoundAction: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  notFoundActionText: {
    fontSize: typography.size.body,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
})
