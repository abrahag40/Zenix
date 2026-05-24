/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * Nova session state:
 *   · actingOrgId      → org cliente seleccionada en el switcher
 *   · actingOrgName    → display para chip persistente del topbar
 *   · onBehalfOfUserId → impersonation target (set cuando consultor entra
 *                        a flujos "actuar como cliente"). Activa el
 *                        ImpersonationBanner amber sticky top.
 *   · impersonationReason → razón obligatoria mientras onBehalfOf activo.
 *                            §175 D-NOVA-17 forcing function.
 *
 * Persiste en localStorage para que un reload no rompa el chip — pero NUNCA
 * el JWT (eso vive en useAuthStore con su propio key 'hk_auth').
 *
 * NUNCA persistir impersonationReason silently — si el browser se cierra
 * con impersonation activa, al volver requerimos reconfirmación (§175).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NovaState {
  actingOrgId: string | null
  actingOrgName: string | null
  onBehalfOfUserId: string | null
  impersonationReason: string | null
  setActingOrg: (id: string, name: string) => void
  clearActingOrg: () => void
  startImpersonation: (userId: string, reason: string) => void
  stopImpersonation: () => void
}

export const useNovaStore = create<NovaState>()(
  persist(
    (set) => ({
      actingOrgId: null,
      actingOrgName: null,
      onBehalfOfUserId: null,
      impersonationReason: null,
      setActingOrg: (id, name) => set({ actingOrgId: id, actingOrgName: name }),
      clearActingOrg: () =>
        set({
          actingOrgId: null,
          actingOrgName: null,
          // clearing org también limpia impersonation (no tiene sentido sin org)
          onBehalfOfUserId: null,
          impersonationReason: null,
        }),
      startImpersonation: (userId, reason) =>
        set({ onBehalfOfUserId: userId, impersonationReason: reason }),
      stopImpersonation: () =>
        set({ onBehalfOfUserId: null, impersonationReason: null }),
    }),
    {
      name: 'nova_session',
      // Solo persistir org selection — impersonation NUNCA persiste
      // entre reloads (forcing function de re-confirmación §175).
      partialize: (state) => ({
        actingOrgId: state.actingOrgId,
        actingOrgName: state.actingOrgName,
      }),
    },
  ),
)
