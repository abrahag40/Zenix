/**
 * system-role-mapper — Sprint testing BUG #20 fix.
 *
 * JwtPayload.role lleva `StaffRole` (SUPERVISOR | RECEPTIONIST | HOUSEKEEPER) —
 * el rol intra-property del tier ORG_STAFF (§160 D-NOVA-2 hierarchy 5-tier).
 *
 * AuditLog universal §165 D-NOVA-7 espera `SystemRole` (PLATFORM_ADMIN |
 * PARTNER_ADMIN | PARTNER_MEMBER | ORG_OWNER | ORG_STAFF). Cuando el actor
 * tiene `actorTier` set en el JWT (PARTNER_MEMBER haciendo impersonation,
 * PLATFORM_ADMIN debugeando un cliente, etc.) ése es el SystemRole real.
 *
 * Para staff PMS interno (SUPERVISOR/RECEPTIONIST/HOUSEKEEPER sin actorTier)
 * el SystemRole correcto es `ORG_STAFF` — son empleados del cliente, no
 * partners ni platform staff.
 */
import { SystemRole } from '@prisma/client'
import type { JwtPayload } from '@zenix/shared'

export function mapJwtRoleToSystemRole(actor: JwtPayload): SystemRole {
  // Si JWT trae actorTier explícito (Nova / impersonation), lo respetamos.
  const tier = (actor as JwtPayload & { actorTier?: string }).actorTier
  if (tier && tier in SystemRole) {
    return SystemRole[tier as keyof typeof SystemRole]
  }
  // Mapeo StaffRole (PMS intra-property) → SystemRole legacy slots:
  //   SUPERVISOR    → MANAGER
  //   RECEPTIONIST  → RECEPTIONIST (mismo nombre)
  //   HOUSEKEEPER   → HOUSEKEEPER (mismo nombre)
  switch (actor.role) {
    case 'SUPERVISOR':   return SystemRole.MANAGER
    case 'RECEPTIONIST': return SystemRole.RECEPTIONIST
    case 'HOUSEKEEPER':  return SystemRole.HOUSEKEEPER
    default:             return SystemRole.RECEPTIONIST // fail-safe conservador
  }
}
