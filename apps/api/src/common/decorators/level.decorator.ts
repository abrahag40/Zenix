/**
 * @RequiresLevel — guard de autoridad jerárquica (Sprint 9 G1).
 *
 * Decorator que combina `Department` + `StaffLevel` para autorizar acciones
 * que requieren ser líder de un área específica.
 *
 * Ejemplos:
 *   @RequiresLevel(StaffLevel.LEAD)
 *     → cualquier líder (HK lead, MAINT lead, RECEP lead)
 *
 *   @RequiresLevel(StaffLevel.LEAD, { department: Department.HOUSEKEEPING })
 *     → solo el lead de HOUSEKEEPING (uso típico para verifyTask, rejectTask)
 *
 *   @RequiresLevel(StaffLevel.LEAD, { department: Department.MAINTENANCE })
 *     → solo lead de mantenimiento (uso para approveBlock OUT_OF_ORDER)
 *
 * Por qué un decorator separado de @Roles:
 *   - @Roles validaba el legacy `StaffRole` enum (mezcla función + jerarquía).
 *   - @RequiresLevel es ortogonal — combina (department, level) sin tocar role.
 *   - Permite deprecation incremental de StaffRole.
 *
 * Permission matrix completa: ver apps/api/src/common/permissions/staff-permissions.ts.
 */
import { SetMetadata } from '@nestjs/common'
import { Department, StaffLevel } from '@zenix/shared'

export const LEVEL_KEY = 'level'

export interface LevelRequirement {
  level: StaffLevel
  department?: Department
}

/**
 * @param level   Nivel mínimo requerido (LEAD restringe; COLLABORATOR es default).
 * @param options Restricción adicional opcional por department.
 */
export const RequiresLevel = (
  level: StaffLevel,
  options: { department?: Department } = {},
) => SetMetadata(LEVEL_KEY, { level, department: options.department } as LevelRequirement)
