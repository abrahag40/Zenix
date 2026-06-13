import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthResponse } from '@zenix/shared'
import { usePropertyStore } from './property'

interface AuthState {
  token: string | null
  user: AuthResponse['user'] | null
  setAuth: (data: AuthResponse) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (data) => {
        localStorage.setItem('hk_token', data.accessToken)
        set({ token: data.accessToken, user: data.user })
        // Seed the property switcher con la propiedad home del usuario.
        // El display name se deja vacío a propósito — la query /properties del
        // PropertySwitcher lo resuelve y evita parpadear el UUID en el top bar.
        // Respeta la propiedad persistida SOLO si pertenece a ESTE mismo usuario
        // (reload / re-login). Si la dejó otro usuario (o no hay), resetea a su
        // home — evita que el calendario aterrice en el hotel equivocado.
        const prop = usePropertyStore.getState()
        if (!prop.activePropertyId || prop.ownerUserId !== data.user.id) {
          prop.setActiveProperty(data.user.propertyId, '', data.user.id)
        }
      },
      logout: () => {
        localStorage.removeItem('hk_token')
        set({ token: null, user: null })
        usePropertyStore.getState().clear()
      },
    }),
    { name: 'hk_auth' },
  ),
)
