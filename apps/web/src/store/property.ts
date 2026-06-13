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
  /**
   * A qué usuario pertenece la propiedad activa persistida. Evita que el login
   * de OTRO usuario herede una propiedad stale del usuario anterior (bug del
   * calendario mostrando un hotel equivocado). El mismo usuario que recarga o
   * re-loguea conserva su elección; un usuario distinto resetea a su home.
   */
  ownerUserId: string | null
  setActiveProperty: (id: string, name: string, ownerUserId?: string | null) => void
  clear: () => void
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      activePropertyId: null,
      activePropertyName: null,
      ownerUserId: null,
      setActiveProperty: (id, name, ownerUserId) =>
        set((s) => ({
          activePropertyId: id,
          activePropertyName: name,
          // Si el caller no provee ownerUserId, conserva el existente
          // (ej. cuando solo se actualiza el display name desde el switcher).
          ownerUserId: ownerUserId !== undefined ? ownerUserId : s.ownerUserId,
        })),
      clear: () => set({ activePropertyId: null, activePropertyName: null, ownerUserId: null }),
    }),
    { name: 'zx_active_property' },
  ),
)
