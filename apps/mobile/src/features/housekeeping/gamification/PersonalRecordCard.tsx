/**
 * PersonalRecordCard — Strava-style PR card.
 *
 * Self-vs-self exclusivamente. Muestra los récords personales por
 * categoría de habitación. Discreto — NO compite con el donut, NO
 * tiene CTA invasivos.
 *
 * Privacy: solo el propio staff lo ve en su Hub. Supervisor lo ve
 * para coaching (Sprint 9). Peers nunca (D9).
 *
 * Layout:
 *   ┌─ TUS RÉCORDS PERSONALES ─────────────────┐
 *   │  ★ Suite          22 min   hace 3 días    │
 *   │  ★ Estándar       18 min   hace 1 semana  │
 *   │  ★ Compartida     12 min   ayer            │
 *   └────────────────────────────────────────────┘
 */

import { View, Text, StyleSheet } from 'react-native'
import { dashboardType } from '../../dashboard/typography'
import { DashCard } from '../../dashboard/components/_DashCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { StaffPersonalRecordDto } from '@zenix/shared'

interface PersonalRecordCardProps {
  records: StaffPersonalRecordDto[] | null
}

const CATEGORY_LABEL: Record<string, string> = {
  PRIVATE: 'Habitación privada',
  SHARED: 'Dormitorio',
  // Sprint 9+: when room types arrive, map by id → human label
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const days = Math.floor((now - then) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 14) return 'hace 1 semana'
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`
  if (days < 60) return 'hace 1 mes'
  return `hace ${Math.floor(days / 30)} meses`
}

export function PersonalRecordCard({ records }: PersonalRecordCardProps) {
  if (!records || records.length === 0) {
    // First-time state: gentle hint, no pressure
    return (
      <DashCard label="TUS RÉCORDS PERSONALES">
        <Text style={[dashboardType.caption, styles.empty]}>
          Termina tu primera limpieza para registrar tu mejor tiempo.
        </Text>
      </DashCard>
    )
  }

  return (
    <DashCard label="TUS RÉCORDS PERSONALES">
      <View style={styles.list}>
        {records.map((r) => (
          <View key={r.roomCategory} style={styles.row}>
            <Text style={styles.icon}>★</Text>
            <Text style={styles.category} numberOfLines={1}>
              {CATEGORY_LABEL[r.roomCategory] ?? r.roomCategory}
            </Text>
            <Text style={styles.value}>{r.bestLabel}</Text>
            <Text style={styles.when}>{relativeTime(r.achievedAt)}</Text>
          </View>
        ))}
      </View>
    </DashCard>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 14,
    color: '#FBBF24',
    width: 16,
    textAlign: 'center',
  },
  category: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
  },
  value: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
    minWidth: 64,
    textAlign: 'right',
  },
  when: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    minWidth: 80,
    textAlign: 'right',
  },
  empty: {
    paddingVertical: 8,
  },
})
