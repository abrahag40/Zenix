import { ModuleStub } from '../../_shared/ModuleStub'
import { IconWasher } from '../icons'

/**
 * Laundry Hub — stub branded (Sprint 8I).
 * Real implementation lands in Sprint 12 (V1.1 básico, completo V1.2 con Inventory).
 */
export function LaundryHub() {
  return (
    <ModuleStub
      title="Lavandería"
      tagline="Ciclos de blancos, tracking y costos en tiempo real"
      Icon={IconWasher}
      eta="v1.1 / v1.2"
      features={[
        'Tracking de blancos por código (sábanas, toallas, uniformes)',
        'Sincronización automática con housekeeping al cambiar linens',
        'Alertas de pérdidas: "Hoy faltan 12 toallas"',
        'Dashboard de costo de lavandería por habitación-noche',
        'Conexión con Inventario para auto-débito de detergentes',
      ]}
    />
  )
}
