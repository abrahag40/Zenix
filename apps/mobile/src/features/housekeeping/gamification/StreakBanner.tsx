/**
 * StreakBanner — racha discreta en el greeting del Hub.
 *
 * Inspirado en Duolingo pero **explícitamente adulto** (sin owl, sin
 * fuego en cada esquina). Pretende:
 *   - Confirmar continuidad ("día 7")
 *   - Mostrar el récord histórico ("mejor 21 días") sin presión
 *   - Indicar al-risk SUTILMENTE, NUNCA con shame
 *
 * Visual:
 *   ┌─────────────────────────────────────────┐
 *   │  🌱 7 días seguidos · récord 21         │
 *   └─────────────────────────────────────────┘
 *
 * Estados:
 *   - currentDays === 0          → no se renderiza (no agregamos ruido)
 *   - currentDays >= 1           → línea sutil con plant emoji
 *   - currentDays >= longestDays → "récord personal" en tono celebratory
 *   - isAtRisk + currentDays > 0 → mensaje neutral "completa una tarea hoy"
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { IconLeaf, IconStar } from '../../../design/icons'
import type { StaffStreakDto } from '@zenix/shared'

interface StreakBannerProps {
  streak: StaffStreakDto | null
}

export function StreakBanner({ streak }: StreakBannerProps) {
  if (!streak || streak.currentDays === 0) return null

  const isPR = streak.currentDays >= streak.longestDays && streak.currentDays > 1
  const days = streak.currentDays
  const best = streak.longestDays

  return (
    <View style={[styles.banner, isPR && styles.bannerPR]}>
      <View style={styles.iconWrap}>
        {isPR
          ? <IconStar size={15} color="#FBBF24" filled />
          : <IconLeaf size={15} color="#34D399" />}
      </View>
      <Text style={styles.text}>
        <Text style={[styles.daysCount, isPR && styles.daysCountPR]}>
          {days}
        </Text>
        <Text style={styles.daysLabel}>{` día${days !== 1 ? 's' : ''} seguidos`}</Text>
        {best > days && (
          <Text style={styles.bestLabel}>{`  ·  récord ${best}`}</Text>
        )}
        {isPR && (
          <Text style={styles.prHint}>{`  ·  récord personal`}</Text>
        )}
      </Text>

      {streak.isAtRisk && (
        <Text style={styles.atRiskHint}>
          completa una tarea hoy para mantenerla
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.18)',
    flexWrap: 'wrap',
  },
  bannerPR: {
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderColor: 'rgba(251,191,36,0.30)',
  },
  iconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontSize: typography.size.small,
  },
  daysCount: {
    color: '#34D399',
    fontWeight: typography.weight.bold,
  },
  daysCountPR: {
    color: '#FBBF24',
  },
  daysLabel: {
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  bestLabel: {
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  prHint: {
    color: '#FBBF24',
    fontWeight: typography.weight.semibold,
  },
  atRiskHint: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
})
