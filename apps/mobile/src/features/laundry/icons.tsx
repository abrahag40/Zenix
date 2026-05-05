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

// Washing machine — primary laundry icon
export function IconWasher({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...pathProps(color, active)} />
      <Circle cx="12" cy="13" r="5" {...pathProps(color, false)} />
      <Circle cx="7" cy="6.5" r="0.6" {...pathProps(color, false)} fill={color} fillOpacity={1} />
      <Circle cx="10" cy="6.5" r="0.6" {...pathProps(color, false)} fill={color} fillOpacity={1} />
    </Svg>
  )
}
