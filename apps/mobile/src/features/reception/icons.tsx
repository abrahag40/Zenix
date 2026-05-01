import Svg, { Path, Circle } from 'react-native-svg'

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

// Concierge bell — primary reception icon
export function IconConcierge({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 18h16M5 18a7 7 0 0 1 14 0M12 4v3M9 4h6" {...pathProps(color, active)} />
      <Circle cx="12" cy="3.5" r="0.8" {...pathProps(color, false)} fill={color} fillOpacity={1} />
    </Svg>
  )
}
