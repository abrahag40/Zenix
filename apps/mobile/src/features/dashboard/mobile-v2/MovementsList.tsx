/**
 * MovementsList — tabs Llegadas/Salidas para RECEPTIONIST.
 * Sin tab Walk-in per D-MOB-1 plan (owner 2026-06-08).
 */
import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { ReceptionistSnapshot } from '../api/useMobileDashboard'

type Tab = 'arrivals' | 'departures'

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function MovementsList({ movements }: { movements: ReceptionistSnapshot['movements'] }) {
  const [tab, setTab] = useState<Tab>('arrivals')
  const items = tab === 'arrivals' ? movements.arrivals : movements.departures

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'arrivals' && styles.tabActive]} onPress={() => setTab('arrivals')}>
          <Text style={[styles.tabText, tab === 'arrivals' && styles.tabTextActive]}>
            Llegadas <Text style={styles.tabCount}>{movements.arrivals.length}</Text>
          </Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'departures' && styles.tabActive]} onPress={() => setTab('departures')}>
          <Text style={[styles.tabText, tab === 'departures' && styles.tabTextActive]}>
            Salidas <Text style={styles.tabCount}>{movements.departures.length}</Text>
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Sin {tab === 'arrivals' ? 'llegadas' : 'salidas'} programadas hoy.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((it) => (
            <Pressable
              key={it.stayId}
              style={({ pressed }) => [styles.itemRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push(`/reservation/${it.stayId}` as never)}
            >
              <View style={styles.roomBadge}>
                <Text style={styles.roomBadgeText}>{it.roomLabel}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.guestName} numberOfLines={1}>{it.guestName}</Text>
                <Text style={styles.meta}>
                  {tab === 'arrivals'
                    ? `ETA ${formatTime((it as { etaIso: string }).etaIso)} · ${(it as { paxCount: number }).paxCount} pax`
                    : `Salida ${formatTime((it as { scheduledIso: string }).scheduledIso)}`}
                </Text>
              </View>
              {it.balance > 0 ? (
                <View style={styles.balanceBadge}>
                  <Text style={styles.balanceText}>{formatMoney(it.balance, it.currency)}</Text>
                </View>
              ) : (
                <Text style={styles.paidLabel}>✓ Pagado</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.canvas.primary,
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.canvas.tertiary,
  },
  tabText: {
    fontSize: typography.size.small,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.text.primary,
  },
  tabCount: {
    color: colors.brand[400],
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 12,
  },
  roomBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.brand[500] + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brand[500] + '55',
    minWidth: 50,
    alignItems: 'center',
  },
  roomBadgeText: {
    color: colors.brand[300],
    fontSize: typography.size.small,
    fontWeight: '700',
  },
  guestName: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  meta: {
    marginTop: 2,
    fontSize: typography.size.micro,
    color: colors.text.secondary,
  },
  balanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.warning[500] + '22',
    borderRadius: 6,
  },
  balanceText: {
    color: colors.warning[500],
    fontSize: typography.size.small,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  paidLabel: {
    color: colors.brand[400],
    fontSize: typography.size.small,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },
})
