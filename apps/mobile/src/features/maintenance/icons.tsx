/**
 * Maintenance icons.
 * Same visual style as src/design/icons.tsx: stroke 1.75, round caps, 24x24 viewBox.
 */
import Svg, { Path } from 'react-native-svg'

const STROKE_WIDTH = 1.75
const pathProps = (color: string, active: boolean) => ({
  stroke: color,
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: active ? color : 'none',
  fillOpacity: active ? 0.18 : 0,
})

interface IconProps { size?: number; color?: string; active?: boolean }

// Wrench (llave inglesa) — primary maintenance icon
export function IconWrench({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14.7 6.3a4 4 0 0 1 5.3 5.3l-1.4-1.4-2.5 2.5-1.6-1.6 2.5-2.5L14.7 6.3zM5 19l5.5-5.5M3 21l2-2M11.5 11.5l5 5" {...pathProps(color, active)} />
    </Svg>
  )
}
