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
        // Seed the property switcher with the user's home property id.
        // The display name is left empty on purpose — PropertySwitcher's
        // /properties query resolves it moments later and avoids flashing
        // the raw UUID in the top bar. If the user already had a property
        // active (persisted from a previous session), respect it.
        const prop = usePropertyStore.getState()
        if (!prop.activePropertyId) {
          prop.setActiveProperty(data.user.propertyId, '')
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
