/**
 * SpecialRequestsListScreen — full list when "Ver todas" tapped on
 * the dashboard SpecialRequestsCard.
 */

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { dashboardType } from '../../dashboard/typography'
import { useAuthStore } from '../../../store/auth'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_SPECIAL_REQUESTS,
} from '../../dashboard/__mocks__/mockDashboard'
import type { SpecialRequest, SpecialRequestType } from '../../dashboard/components/SpecialRequestsCard'

const TYPE_INFO: Record<SpecialRequestType, { emoji: string; label: string }> = {
  OCEAN_VIEW:     { emoji: '🌅', label: 'Vista al mar' },
  EXTRA_BED:      { emoji: '🛏', label: 'Cama extra' },
  CRIB:           { emoji: '👶', label: 'Cuna' },
  CELEBRATION:    { emoji: '🥂', label: 'Celebración' },
  EARLY_CHECKIN:  { emoji: '⏰', label: 'Check-in temprano' },
  LATE_CHECKOUT:  { emoji: '🕐', label: 'Late check-out' },
  ACCESSIBILITY:  { emoji: '♿', label: 'Accesibilidad' },
  DIETARY:        { emoji: '🥗', label: 'Dietética' },
  QUIET_ROOM:     { emoji: '🤫', label: 'Habitación silenciosa' },
  AIRPORT_PICKUP: { emoji: '🚐', label: 'Transfer aeropuerto' },
  OTHER:          { emoji: '📝', label: 'Solicitud' },
}

export function SpecialRequestsListScreen() {
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'
  const list: SpecialRequest[] = MOCKS_DASHBOARD_ENABLED ? MOCK_SPECIAL_REQUESTS : []

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Solicitudes especiales" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.summary}>
          {list.length === 0
            ? 'Sin solicitudes pendientes ✓'
            : `${list.length} solicitud${list.length !== 1 ? 'es' : ''} pendiente${list.length !== 1 ? 's' : ''} de cumplir hoy`}
        </Text>

        {list.map((r) => {
          const info = TYPE_INFO[r.type]
          return (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => Haptics.selectionAsync()}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>{info.emoji}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={dashboardType.sectionLabel}>{info.label.toUpperCase()}</Text>
                <Text style={[dashboardType.bodyEmphasis, { marginTop: 4 }]}>
                  {r.description}
                </Text>
                <Text style={[dashboardType.caption, { marginTop: 2 }]}>
                  {r.roomNumber ? `Hab. ${r.roomNumber}` : '—'}
                  {!isHK && r.guestName ? ` · ${r.guestName}` : ''}
                  {' · '}{r.whenLabel}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas.primary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  summary: {
    fontSize: 16, color: colors.text.secondary, lineHeight: 22, paddingTop: 4, paddingBottom: 12,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1, borderColor: colors.border.subtle,
  },
  rowPressed: { opacity: 0.6 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 20 },
  rowBody: { flex: 1, gap: 0 },
  chevron: {
    fontSize: 22, color: colors.text.tertiary, fontWeight: '300',
  },
})
