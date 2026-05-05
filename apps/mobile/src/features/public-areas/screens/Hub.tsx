import { ModuleStub } from '../../_shared/ModuleStub'
import { IconBuilding } from '../icons'

/**
 * Public Areas Hub — stub branded (Sprint 8I).
 * Real implementation lands in Sprint 11 (V1.1) per docs/zenix-roadmap.md.
 */
export function PublicAreasHub() {
  return (
    <ModuleStub
      title="Áreas Públicas"
      tagline="Lobby, pasillos, baños y zonas comunes — operación dedicada"
      Icon={IconBuilding}
      eta="v1.1"
      features={[
        'Schedules rotativos por hora del día',
        'Checklists específicos por zona común',
        'Reminders push según frecuencia (cada 2h, cada 4h)',
        'Coordinación con eventos: limpieza pre y post banquete',
        'Reportes de calidad para auditoría hotelera',
      ]}
    />
  )
}
