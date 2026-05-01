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

// Tree — primary gardening icon
export function IconTree({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c-3 0-5 2-5 4 0 2 1 3 1 3-2 0-4 2-4 4 0 2 2 3 3 3-1 0-3 1-3 3 0 2 2 3 4 3h8c2 0 4-1 4-3 0-2-2-3-3-3 1 0 3-1 3-3 0-2-2-4-4-4 0 0 1-1 1-3 0-2-2-4-5-4zM12 22v-6" {...pathProps(color, active)} />
    </Svg>
  )
}
