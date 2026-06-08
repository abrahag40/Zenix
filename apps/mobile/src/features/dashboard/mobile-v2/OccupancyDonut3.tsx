/**
 * OccupancyDonut3 — donut 3-state (D-MOB-6 plan MOBILE-DASHBOARD).
 *
 * Owner 2026-06-08: "no veo valor agregado en mostrar las habitaciones
 * vacías dentro de la gráfica". Solo segmentos accionables:
 *   🟢 Ocupadas (revenue captured)
 *   🟡 Llegadas hoy (en proceso)
 *   🔴 Bloqueadas (mtto/OOO)
 * Vacías = track gris implícito (complemento numérico en header).
 *
 * Implementación SVG nativo (sin react-native-svg-charts dep) — simple
 * y previsible, segmentos como arcs sobre circunferencia.
 */
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface Props {
  occupied: number
  arrivingToday: number
  blocked: number
  total: number
}

const SIZE = 180
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function OccupancyDonut3({ occupied, arrivingToday, blocked, total }: Props) {
  const safeTotal = Math.max(1, total)
  const occupiedFrac = occupied / safeTotal
  const arrivingFrac = arrivingToday / safeTotal
  const blockedFrac = blocked / safeTotal
  const availableCount = Math.max(0, total - occupied - arrivingToday - blocked)

  const occupiedLen = occupiedFrac * CIRCUMFERENCE
  const arrivingLen = arrivingFrac * CIRCUMFERENCE
  const blockedLen = blockedFrac * CIRCUMFERENCE
  // Offset acumulado para cada segmento
  const occupiedOffset = 0
  const arrivingOffset = -occupiedLen
  const blockedOffset = -(occupiedLen + arrivingLen)

  return (
    <View style={styles.root}>
      <View style={styles.donutWrap}>
        <Svg width={SIZE} height={SIZE}>
          <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
            {/* Track de fondo (vacías = implícito) */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.text.tertiary}
              strokeWidth={STROKE}
              fill="transparent"
            />
            {/* Bloqueadas — rojo */}
            {blocked > 0 && (
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={colors.urgent[500]}
                strokeWidth={STROKE}
                fill="transparent"
                strokeDasharray={`${blockedLen}, ${CIRCUMFERENCE}`}
                strokeDashoffset={blockedOffset}
                strokeLinecap="butt"
              />
            )}
            {/* Llegadas hoy — ámbar */}
            {arrivingToday > 0 && (
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={colors.warning[500]}
                strokeWidth={STROKE}
                fill="transparent"
                strokeDasharray={`${arrivingLen}, ${CIRCUMFERENCE}`}
                strokeDashoffset={arrivingOffset}
                strokeLinecap="butt"
              />
            )}
            {/* Ocupadas — verde */}
            {occupied > 0 && (
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={colors.brand[500]}
                strokeWidth={STROKE}
                fill="transparent"
                strokeDasharray={`${occupiedLen}, ${CIRCUMFERENCE}`}
                strokeDashoffset={occupiedOffset}
                strokeLinecap="butt"
              />
            )}
          </G>
        </Svg>
        <View style={styles.center}>
          <Text style={styles.centerNumber}>{occupied}</Text>
          <Text style={styles.centerLabel}>de {total}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <LegendRow color={colors.brand[500]} label="Ocupadas" value={occupied} />
        <LegendRow color={colors.warning[500]} label="Llegan hoy" value={arrivingToday} />
        <LegendRow color={colors.urgent[500]} label="Bloqueadas" value={blocked} />
        <View style={styles.legendDivider} />
        <LegendRow color={colors.text.tertiary} label="Disponibles" value={availableCount} muted />
      </View>
    </View>
  )
}

function LegendRow({ color, label, value, muted }: { color: string; label: string; value: number; muted?: boolean }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, muted && { color: colors.text.secondary }]}>{label}</Text>
      <Text style={[styles.legendValue, muted && { color: colors.text.secondary }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerNumber: {
    fontSize: 44,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.8,
    lineHeight: 48,
  },
  centerLabel: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    marginTop: 2,
  },
  legend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    flex: 1,
  },
  legendValue: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  legendDivider: {
    height: 1,
    backgroundColor: colors.text.tertiary,
    marginVertical: 2,
  },
})
