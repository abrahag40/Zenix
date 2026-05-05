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

// Building columns — primary public-areas icon (lobby/halls)
export function IconBuilding({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 21h18M5 21V8M19 21V8M9 21v-7M15 21v-7M5 8L12 3l7 5M9 14h6" {...pathProps(color, active)} />
    </Svg>
  )
}
