/**
 * SourceBadge — branded chip for OTAs.
 *
 * Each OTA has a recognized brand color (see brand guidelines / press
 * kits). Using the official color in a subtle filled chip helps the
 * receptionist identify the channel pre-attentively (Treisman 1980),
 * exactly as web Booking.com listings show source pills.
 *
 * We use BG at low alpha + FG at full saturation for legibility on
 * dark canvas. Colors below are pulled from each OTA's public press
 * material (2024).
 */

import { View, Text, StyleSheet } from 'react-native'
import { typography } from '../../../design/typography'
import type { ReservationSource } from '../types'

export const SOURCE_BRAND: Record<
  ReservationSource,
  { fg: string; bg: string; label: string }
> = {
  // Booking.com — Booking Blue (#003580). Lightened FG for dark canvas.
  BOOKING:     { fg: '#5BA8FF', bg: 'rgba(91,168,255,0.16)',  label: 'Booking' },
  // Airbnb — Rausch (#FF5A5F).
  AIRBNB:      { fg: '#FF787C', bg: 'rgba(255,90,95,0.16)',   label: 'Airbnb' },
  // Expedia — gold (#FECB00).
  EXPEDIA:     { fg: '#FFD43B', bg: 'rgba(254,203,0,0.18)',   label: 'Expedia' },
  // Hostelworld — Orange (#F36F21).
  HOSTELWORLD: { fg: '#FF9457', bg: 'rgba(243,111,33,0.16)',  label: 'Hostelworld' },
  // Direct booking — emerald accent (brand of the property itself).
  DIRECT:      { fg: '#34D399', bg: 'rgba(16,185,129,0.16)',  label: 'Directo' },
  // Walk-in — neutral gray.
  WALK_IN:     { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.06)', label: 'Walk-in' },
  // Other — neutral.
  OTHER:       { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.06)', label: 'Otro' },
}

interface SourceBadgeProps {
  /** Accepts the strict enum or any free-form string from the server.
   *  Unknown values fall back to OTHER tinting. */
  source: ReservationSource | string | null
  /** Compact (no label) for dense layouts. */
  compact?: boolean
}

export function SourceBadge({ source, compact }: SourceBadgeProps) {
  if (!source) return null
  const cfg = SOURCE_BRAND[source as ReservationSource] ?? SOURCE_BRAND.OTHER
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }, compact && styles.chipCompact]}>
      <View style={[styles.dot, { backgroundColor: cfg.fg }]} />
      {!compact && (
        <Text style={[styles.label, { color: cfg.fg }]}>{cfg.label}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
})
