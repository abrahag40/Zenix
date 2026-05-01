/**
 * ArrivalsTimelineCard — Capa 3 (PREDICTIVE).
 *
 * Hybrid design (justification — Stephen Few 2013, "small multiples"):
 *
 *   Visual density signal (top strip)
 *     A horizontal mini-timeline answers "where do arrivals concentrate
 *     today?". Pre-attentive (Treisman 1980) — the receptionist sees at
 *     a glance whether 16:00 will be busy.
 *
 *   Concrete actionable rows (3 next arrivals)
 *     A list answers "who specifically is coming in next?" — the
 *     receptionist can prep keys, escort, special services.
 *
 * The HYBRID is justified because each view serves a DIFFERENT cognitive
 * task: density-comparison vs. specific-action. Combining them in one
 * card respects Few's "real-estate budget" rule (one card visible).
 *
 * Why this beat the alternatives:
 *   - Pure horizontal timeline → loses concrete next-action info
 *   - Pure vertical list      → loses temporal density signal
 *   - Hostaway uses this exact pattern and tops PMS reviews for arrivals UX
 *
 * Layout:
 *   ┌─ PRÓXIMAS LLEGADAS · 6H ──────────────────┐
 *   │                                            │
 *   │  ●─────●●────●───────●──● ahora 14:42      │  ← timeline strip
 *   │  14    15    16      19  20                │
 *   │                                            │
 *   │  15:00 · Liam Nielsen · Hab 102 · Booking  │  ← top 3 actionable
 *   │  15:00 · Camila Vega  · Hab 105 · Direct   │
 *   │  17:00 · Familia Ortega · Hab C2 · Direct  │
 *   │                                            │
 *   │            Ver todas (7) →                 │
 *   └────────────────────────────────────────────┘
 *
 * Privacy: HK doesn't see this card on dashboard (Sprint 8I omits it
 * for HK; Sprint 9 backend redaction enforces).
 */

import { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { SourceBadge } from '../../reservations/components/SourceBadge'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { ReservationSource } from '../../reservations/types'

export interface UpcomingArrival {
  stayId: string
  /** Pre-formatted local time "15:00". */
  expectedAtLabel: string
  /** Local hour 0-23 — used to position the dot on the timeline strip. */
  expectedHour: number
  /** Backend-redacted by role: null for HOUSEKEEPER. */
  guestName: string | null
  roomNumber: string | null
  paxCount: number
  source: ReservationSource | null
  /** Optional flair: VIP, late-arrival, etc. */
  flair?: string | null
}

interface ArrivalsTimelineCardProps {
  arrivals?: UpcomingArrival[]
  /** Window length in hours from "now". Default 6. */
  windowHours?: number
}

const ROW_CAP = 3
const STRIP_HEIGHT = 44

export function ArrivalsTimelineCard({ arrivals, windowHours = 6 }: ArrivalsTimelineCardProps) {
  const list = arrivals ?? []
  if (list.length === 0) return null

  const nowLabel = useMemo(() => {
    const d = new Date()
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }, [])
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60

  // Cluster arrivals by integer hour for the strip dots.
  const hourClusters = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of list) {
      const h = a.expectedHour
      map.set(h, (map.get(h) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ hour, count }))
  }, [list])

  const visible = list.slice(0, ROW_CAP)
  const overflow = list.length - ROW_CAP

  // Strip math: range = [nowHour, nowHour + windowHours]
  const stripStart = Math.floor(nowHour)
  const stripEnd = stripStart + windowHours
  const positionFor = (h: number): number => {
    const clamped = Math.max(stripStart, Math.min(stripEnd, h))
    return ((clamped - stripStart) / windowHours) * 100
  }

  return (
    <DashCard
      label="PRÓXIMAS LLEGADAS · 6H"
      trailing={
        <Text style={dashboardType.micro}>
          {list.length} {list.length === 1 ? 'llegada' : 'llegadas'}
        </Text>
      }
      cta={
        overflow > 0
          ? {
              label: `Ver todas (${list.length})`,
              tone: 'primary',
              onPress: () => router.push('/trabajo?status=UNCONFIRMED'),
            }
          : undefined
      }
    >
      {/* ── Top: density timeline strip ─────────────────────────── */}
      <View style={styles.strip}>
        {/* Background line */}
        <View style={styles.stripLine} />

        {/* "Now" marker */}
        <View
          style={[
            styles.nowMarker,
            { left: `${((nowHour - stripStart) / windowHours) * 100}%` },
          ]}
        >
          <View style={styles.nowDot} />
          <Text style={styles.nowLabel}>{nowLabel}</Text>
        </View>

        {/* Hour clusters as dots — bigger dot = more arrivals at that hour */}
        {hourClusters.map((c) => (
          <View
            key={c.hour}
            style={[
              styles.clusterDot,
              {
                left: `${positionFor(c.hour)}%`,
                width: 10 + c.count * 3,
                height: 10 + c.count * 3,
                marginLeft: -(10 + c.count * 3) / 2,
              },
            ]}
          />
        ))}

        {/* Hour ticks at integer hours within the window */}
        <View style={styles.tickRow}>
          {Array.from({ length: windowHours + 1 }).map((_, i) => {
            const h = stripStart + i
            const showLabel = i === 0 || i === Math.floor(windowHours / 2) || i === windowHours
            return (
              <View
                key={i}
                style={[styles.tick, { left: `${(i / windowHours) * 100}%` }]}
              >
                {showLabel && <Text style={styles.tickLabel}>{h}h</Text>}
              </View>
            )
          })}
        </View>
      </View>

      {/* ── Bottom: 3 next concrete arrivals ─────────────────── */}
      <View style={styles.list}>
        {visible.map((a) => (
          <Pressable
            key={a.stayId}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => {
              Haptics.selectionAsync()
              router.push(`/reservation/${a.stayId}`)
            }}
          >
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeText}>{a.expectedAtLabel}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
                  {a.guestName ?? 'Huésped'}
                </Text>
                {a.flair && (
                  <View style={styles.flairChip}>
                    <Text style={styles.flairText}>{a.flair}</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowMetaLine}>
                <Text style={dashboardType.caption}>
                  {a.roomNumber ? `Hab. ${a.roomNumber}` : '—'} · {a.paxCount} pax
                </Text>
                {a.source && (
                  <View style={styles.sourceWrap}>
                    <SourceBadge source={a.source} compact />
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </DashCard>
  )
}

const styles = StyleSheet.create({
  // ── Strip
  strip: {
    height: STRIP_HEIGHT,
    marginBottom: 14,
    paddingTop: 14,
  },
  stripLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 21,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clusterDot: {
    position: 'absolute',
    top: 14,
    borderRadius: 99,
    backgroundColor: '#FBBF24',
    transform: [{ translateY: -1 }],
  },
  nowMarker: {
    position: 'absolute',
    top: 8,
    alignItems: 'center',
    transform: [{ translateX: -1 }],
  },
  nowDot: {
    width: 3,
    height: 16,
    backgroundColor: '#34D399',
    borderRadius: 1.5,
  },
  nowLabel: {
    fontSize: 9,
    color: '#34D399',
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  tickRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 14,
  },
  tick: {
    position: 'absolute',
    width: 1,
  },
  tickLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    transform: [{ translateX: -8 }],
  },
  // ── List
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  timeBadge: {
    minWidth: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: '#FBBF24',
    alignItems: 'center',
  },
  timeBadgeText: {
    fontSize: 13,
    color: '#FBBF24',
    fontWeight: typography.weight.bold,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTopLine: {
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
    backgroundColor: 'rgba(245,158,11,0.14)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flairText: {
    fontSize: 10,
    color: '#FBBF24',
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
