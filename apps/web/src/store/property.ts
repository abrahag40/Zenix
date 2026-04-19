import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Tracks the property the user is currently "viewing".
 *
 * Seed from the JWT on login (user.propertyId), then allow the user to
 * switch to any other property within the same organization via
 * <PropertySwitcher />. All data hooks (useGuestStays, useRoomGroups,
 * useStayJourneys, etc.) read `activePropertyId` from this store instead
 * of from the JWT, so the switch only has to flow through one place.
 *
 * Persisted so a page reload keeps the chosen property. The switch is
 * scoped to the same tenant — the TenantGuard on the backend still
 * blocks cross-organization access on the orgId of the JWT.
 */
interface PropertyState {
  activePropertyId: string | null
  activePropertyName: string | null
  setActiveProperty: (id: string, name: string) => void
  clear: () => void
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      activePropertyId: null,
      activePropertyName: null,
      setActiveProperty: (id, name) =>
        set({ activePropertyId: id, activePropertyName: name }),
      clear: () => set({ activePropertyId: null, activePropertyName: null }),
    }),
    { name: 'zx_active_property' },
  ),
)
