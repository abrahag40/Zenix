/**
 * Hero — top zone del dashboard mobile (todos los roles).
 *
 * Pattern Apple Weather / Mews Pocket — greeting + property + role chip.
 * Time-aware greeting backed por backend (Buenos días/tardes/noches).
 */
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { MobileDashboardHero } from '../api/useMobileDashboard'

export function Hero({ hero, roleLabel }: { hero: MobileDashboardHero; roleLabel: string }) {
  return (
    <View style={styles.root}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{hero.greeting}</Text>
          <Text style={styles.name}>{hero.firstName}</Text>
        </View>
        <View style={styles.roleChip}>
          <Text style={styles.roleChipText}>{roleLabel}</Text>
        </View>
      </View>
      <View style={styles.propertyRow}>
        <Text style={styles.propertyLabel}>Tu propiedad</Text>
        <Text style={styles.propertyName}>
          {hero.propertyName}
          {hero.propertyCity ? <Text style={styles.propertyCity}> · {hero.propertyCity}</Text> : null}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: colors.canvas.primary,
  },
  greeting: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  name: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 4,
    letterSpacing: -0.4,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brand[500] + '22',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brand[500] + '55',
  },
  roleChipText: {
    color: colors.brand[300],
    fontSize: typography.size.small,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  propertyRow: {
    marginTop: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
  },
  propertyLabel: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  propertyName: {
    marginTop: 4,
    fontSize: typography.size.bodyLg,
    color: colors.text.primary,
    fontWeight: '600',
  },
  propertyCity: {
    color: colors.text.secondary,
    fontWeight: '400',
  },
})
