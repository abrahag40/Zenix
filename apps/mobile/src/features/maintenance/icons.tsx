/**
 * Maintenance icons.
 * Same visual style as src/design/icons.tsx: stroke 1.75, round caps, 24x24 viewBox.
 *
 * Sprint Mx-1B-W2 testing T-icon — el path anterior renderizaba como una
 * forma ambigua a 22-24pt en el tab bar. Reemplazado por la versión canónica
 * de Lucide (https://lucide.dev/icons/wrench) — claramente reconocible como
 * llave inglesa en cualquier tamaño.
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

// Wrench (llave inglesa) — path canon Lucide.
// El "anillo" del extremo + mango ligeramente curvo = silueta inconfundible.
export function IconWrench({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        {...pathProps(color, active)}
      />
    </Svg>
  )
}
