/**
 * MovementsCard — replaces ArrivalsTimelineCard.
 *
 * v3 design (this iteration) per user feedback:
 *   - User said "no entendí la gráfica, removerla" → strip removed
 *   - User said "remover la hora de llegada, no siempre cumplen" → expectedAtLabel
 *     replaced with relative period bucket ("Por la tarde", "Por la noche")
 *   - User asked: "ahí mismo el usuario seleccione si desea ver checkin y
 *     checkouts, un toggle podría ser? tabs centradas en la parte superior?"
 *     → segmented tabs: Llegadas | Salidas (centered, top of body)
 *
 * Layout:
 *   ┌─ MOVIMIENTOS DE HOY                       7 / 5 ┐
 *   │                                                  │
 *   │      ┌─────────────────────────────┐             │
 *   │      │  Llegadas (7)  ·  Salidas (5) │             │  ← segmented tabs
 *   │      └─────────────────────────────┘             │
 *   │                                                  │
 *   │  María García         Hab 203 · 2 pax · Booking  │
 *   │  Carlos Mendoza       Hab 105 · 1 pax · Airbnb   │
 *   │  Sofía Ramírez        Hab 312 · 1 pax · Direct   │
 *   │                                                  │
 *   │                            Ver todas (7) →       │
 *   └──────────────────────────────────────────────────┘
 */

import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { SourceBadge } from '../../reservations/components/SourceBadge'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { ReservationSource } from '../../reservations/types'

type MovementMode = 'arrivals' | 'departures'

export interface MovementItem {
  stayId: string
  /** Backend-redacted by role: null for HOUSEKEEPER. */
  guestName: string | null
  roomNumber: string | null
  paxCount: number
  source: ReservationSource | null
  /** Optional flair: VIP, Late checkout, etc. */
  flair?: string | null
}

interface MovementsCardProps {
  arrivals?: MovementItem[]
  departures?: MovementItem[]
}

const ROW_CAP = 3

export function MovementsCard({ arrivals = [], departures = [] }: MovementsCardProps) {
  const [mode, setMode] = useState<MovementMode>('arrivals')

  const list = mode === 'arrivals' ? arrivals : departures
  const visible = list.slice(0, ROW_CAP)
  const overflow = list.length - ROW_CAP

  // Hide the card entirely if BOTH lists are empty
  if (arrivals.length === 0 && departures.length === 0) return null

  const handleSeeAll = () => {
    Haptics.selectionAsync()
    router.push(
      mode === 'arrivals'
        ? '/trabajo?status=UNCONFIRMED'
        : '/trabajo?status=DEPARTING',
    )
  }

  return (
    <DashCard
      label="MOVIMIENTOS DE HOY"
      cta={
        overflow > 0
          ? {
              label: `Ver todas (${list.length})`,
              tone: 'primary',
              onPress: handleSeeAll,
            }
          : undefined
      }
    >
      {/* Centered segmented tabs (Apple iOS pattern) */}
      <View style={styles.tabsWrap}>
        <View style={styles.tabsTrack}>
          <Tab
            label="Llegadas"
            count={arrivals.length}
            active={mode === 'arrivals'}
            onPress={() => {
              if (mode !== 'arrivals') {
                Haptics.selectionAsync()
                setMode('arrivals')
              }
            }}
          />
          <Tab
            label="Salidas"
            count={departures.length}
            active={mode === 'departures'}
            onPress={() => {
              if (mode !== 'departures') {
                Haptics.selectionAsync()
                setMode('departures')
              }
            }}
          />
        </View>
      </View>

      {/* List */}
      {visible.length === 0 ? (
        <Text style={styles.emptyText}>
          {mode === 'arrivals'
            ? 'Sin llegadas pendientes hoy ✓'
            : 'Sin salidas pendientes hoy ✓'}
        </Text>
      ) : (
        <View style={styles.list}>
          {visible.map((item) => (
            <MovementRow
              key={item.stayId}
              item={item}
              mode={mode}
              onPress={() => {
                Haptics.selectionAsync()
                router.push(`/reservation/${item.stayId}`)
              }}
            />
          ))}
        </View>
      )}
    </DashCard>
  )
}

function Tab({
  label,
  count,
  active,
  onPress,
}: {
  label: string
  count: number
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>
        {count}
      </Text>
    </Pressable>
  )
}

function MovementRow({
  item,
  mode,
  onPress,
}: {
  item: MovementItem
  mode: MovementMode
  onPress: () => void
}) {
  // Mode-aware tint: arrivals = amber (incoming), departures = blue (outgoing).
  // Treisman 1980 — pre-attentive color carries direction without label.
  const tint =
    mode === 'arrivals'
      ? { fg: '#FBBF24', bg: 'rgba(245,158,11,0.14)' }
      : { fg: '#60A5FA', bg: 'rgba(59,130,246,0.14)' }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.dot, { backgroundColor: tint.fg }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
            {item.guestName ?? 'Huésped'}
          </Text>
          {item.flair && (
            <View style={[styles.flairChip, { backgroundColor: tint.bg, borderColor: tint.fg }]}>
              <Text style={[styles.flairText, { color: tint.fg }]}>{item.flair}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowMetaLine}>
          <Text style={dashboardType.caption}>
            {item.roomNumber ? `Hab. ${item.roomNumber}` : '—'} · {item.paxCount} pax
          </Text>
          {item.source && (
            <View style={styles.sourceWrap}>
              <SourceBadge source={item.source} compact />
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // ── Tabs (centered segmented control)
  tabsWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    minWidth: 240,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 7,
  },
  tabActive: {
    backgroundColor: colors.canvas.secondary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  tabLabelActive: {
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
  },
  tabCount: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
  },
  tabCountActive: {
    color: colors.brand[400],
  },
  // ── List
  list: {
    paddingTop: 4,
    gap: 4,
  },
  emptyText: {
    paddingVertical: 18,
    fontSize: 14,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flairChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  flairText: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  sourceWrap: {
    marginLeft: 'auto',
  },
  chevron: {
    fontSize: 22,
    color: colors.text.tertiary,
    fontWeight: '300',
    paddingHorizontal: 4,
  },
})
