import { ModuleStub } from '../../_shared/ModuleStub'
import { IconWrench } from '../icons'

/**
 * Maintenance Hub — stub branded (Sprint 8I).
 * Real implementation lands in Sprint 10 (V1.1) per docs/zenix-roadmap.md.
 */
export function MaintenanceHub() {
  return (
    <ModuleStub
      title="Mantenimiento"
      tagline="Tu centro de tickets, asignaciones y reparaciones del hotel"
      Icon={IconWrench}
      eta="v1.1"
      features={[
        'Reportar tickets desde el celular con foto antes/después',
        'Asignación automática por especialidad (eléctrico, plomería, HVAC)',
        'Bloqueo automático de habitaciones con tickets críticos',
        'Loop directo con housekeeping cuando detecte un problema',
        'Inventario de refacciones conectado al módulo de Compras',
      ]}
    />
  )
}
