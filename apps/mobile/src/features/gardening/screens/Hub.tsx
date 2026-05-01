import { ModuleStub } from '../../_shared/ModuleStub'
import { IconTree } from '../icons'

/**
 * Gardening Hub — stub branded (Sprint 8I).
 * Real implementation: demand-driven, V1.3+ vertical (resort/boutique con jardines significativos).
 */
export function GardeningHub() {
  return (
    <ModuleStub
      title="Jardinería"
      tagline="Áreas verdes, riego programado y mantenimiento de paisajismo"
      Icon={IconTree}
      eta="v1.3+"
      features={[
        'Inventario de plantas, palmas y áreas verdes por zona',
        'Schedules de riego según clima + estación',
        'Reportes de poda, fertilización, control de plagas',
        'Coordinación con eventos al aire libre',
        'Foto antes/después por servicio realizado',
      ]}
    />
  )
}
