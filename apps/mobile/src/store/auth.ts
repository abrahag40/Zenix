import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import type { AuthResponse } from '@zenix/shared'
import { api } from '../api/client'
import { createLogger } from '../logger'

const log = createLogger('auth-store')

interface AuthState {
  token: string | null
  user: AuthResponse['user'] | null
  setAuth: (data: AuthResponse) => void
  logout: () => void
  switchProperty: (targetPropertyId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: async (data) => {
        await SecureStore.setItemAsync('hk_token', data.accessToken)
        set({ token: data.accessToken, user: data.user })
        log.info('auth set', { userId: data.user.id, propertyId: data.user.propertyId })
      },

      logout: async () => {
        await SecureStore.deleteItemAsync('hk_token')
        set({ token: null, user: null })
        log.info('logged out')
      },

      /**
       * Switches the active property by requesting a new JWT from the backend.
       * Only available to SUPERVISOR and RECEPTIONIST roles (enforced backend-side).
       * All pending API state is automatically stale because the token changes.
       */
      switchProperty: async (targetPropertyId: string) => {
        log.info('switching property', { targetPropertyId })
        const data = await api.post<AuthResponse>('/auth/switch-property', { targetPropertyId })
        await SecureStore.setItemAsync('hk_token', data.accessToken)
        set({ token: data.accessToken, user: data.user })
        log.info('property switched', { propertyId: data.user.propertyId, propertyName: data.user.propertyName })
      },
    }),
    {
      name: 'hk-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, token: state.token }),
    },
  ),
)
