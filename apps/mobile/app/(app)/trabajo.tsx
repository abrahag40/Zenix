/**
 * "Mi día" tab — role-aware module switch.
 *
 * Architecture: AD-011 "Shared chrome + role-aware module" pattern.
 *
 * The Tab Bar (chrome) is identical for all roles. The CONTENT of this tab
 * varies based on `user.department` — each module is a self-contained
 * feature lives under `src/features/<area>/`. Switching the user's
 * department changes which Hub renders, with zero impact on the other tabs.
 *
 * SwiftUI alignment: this is the equivalent of:
 *
 *   var body: some View {
 *     switch user.department {
 *       case .housekeeping: HousekeepingHub()
 *       case .maintenance:  MaintenanceHub()
 *       ...
 *     }
 *   }
 */

import { useAuthStore } from '../../src/store/auth'
import { Department } from '@zenix/shared'
import { HousekeepingHub } from '../../src/features/housekeeping/screens/Hub'
import { MaintenanceHub } from '../../src/features/maintenance/screens/Hub'
import { LaundryHub } from '../../src/features/laundry/screens/Hub'
import { PublicAreasHub } from '../../src/features/public-areas/screens/Hub'
import { GardeningHub } from '../../src/features/gardening/screens/Hub'
import { ReceptionHub } from '../../src/features/reception/screens/Hub'

export default function TrabajoScreen() {
  const department = useAuthStore((s) => s.user?.department)

  switch (department) {
    case Department.HOUSEKEEPING: return <HousekeepingHub />
    case Department.MAINTENANCE:  return <MaintenanceHub />
    case Department.LAUNDRY:      return <LaundryHub />
    case Department.PUBLIC_AREAS: return <PublicAreasHub />
    case Department.GARDENING:    return <GardeningHub />
    case Department.RECEPTION:    return <ReceptionHub />
    default:
      // Fallback: if user.department is undefined (legacy token) or
      // unknown enum value, show housekeeping as the safest default.
      return <HousekeepingHub />
  }
}
