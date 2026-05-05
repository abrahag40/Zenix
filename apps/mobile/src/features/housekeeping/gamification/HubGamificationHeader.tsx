/**
 * HubGamificationHeader — bloque visible al tope del Hub Recamarista
 * que combina los 3 elementos de la Capa 2 (research §6.1):
 *
 *   - StreakBanner (1 línea, discreto)
 *   - ActivityRings (Apple Fitness pattern)
 *   - PersonalRecordCard (Strava-style)
 *
 * Respeta `gamificationLevel`:
 *
 *   STANDARD → todos los componentes visibles
 *   SUBTLE   → solo StreakBanner (sin rings, sin PR card)
 *   OFF      → no se renderiza nada
 *
 * El nivel se obtiene del backend via `useStaffPreferences` (Sprint 8H
 * scaffold ya existe). Si no hay row aún, default = STANDARD.
 */

import { View, StyleSheet } from 'react-native'
import { ActivityRings } from './ActivityRings'
import { StreakBanner } from './StreakBanner'
import { PersonalRecordCard } from './PersonalRecordCard'
import { useStaffStreak, useDailyRings, usePersonalRecords } from './useGamification'

export type GamificationLevel = 'SUBTLE' | 'STANDARD' | 'OFF'

interface HubGamificationHeaderProps {
  /** Effective gamification level for the current staff. */
  level?: GamificationLevel
}

export function HubGamificationHeader({
  level = 'STANDARD',
}: HubGamificationHeaderProps) {
  // OFF — render nothing (full opt-out, autonomy SDT).
  // Hooks must be called unconditionally — guard via `enabled` prop.
  const isOff = level === 'OFF'
  const isStandard = level === 'STANDARD'
  const streakQ = useStaffStreak({ enabled: !isOff })
  const ringsQ = useDailyRings({ enabled: !isOff && isStandard })
  const recordsQ = usePersonalRecords({ enabled: !isOff && isStandard })

  if (isOff) return null

  return (
    <View style={styles.wrap}>
      <StreakBanner streak={streakQ.data} />

      {/* STANDARD-only blocks */}
      {isStandard && ringsQ.data && (
        <View style={styles.ringsCard}>
          <ActivityRings
            tasks={ringsQ.data.tasksRing}
            minutes={ringsQ.data.minutesRing}
            verified={ringsQ.data.verifiedRing}
            allClosed={ringsQ.data.ringsCompleted}
          />
        </View>
      )}

      {isStandard && (
        <PersonalRecordCard records={recordsQ.data} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  ringsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
})
