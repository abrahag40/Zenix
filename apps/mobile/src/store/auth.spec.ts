/**
 * auth.spec.ts — Sprint QA-α mobile.
 *
 * Cobertura para Zustand auth store. Verifica:
 *  - setAuth persiste token en SecureStore + state
 *  - logout limpia ambos
 *  - switchProperty llama API + actualiza token + user
 *  - Bug #24 fix: envía `targetPropertyId` correcto (no `propertyId`)
 */
import { jest } from '@jest/globals'

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}))

jest.mock('../api/client', () => ({
  api: { post: jest.fn(), get: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}))

import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'
import { useAuthStore } from './auth'

const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock
const mockPost = api.post as jest.Mock

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSetItemAsync.mockResolvedValue(undefined as never)
    mockDeleteItemAsync.mockResolvedValue(undefined as never)
    useAuthStore.setState({ token: null, user: null })
  })

  const sampleAuthResponse = {
    accessToken: 'jwt-token-abc',
    user: {
      id: 'user-1',
      name: 'María',
      email: 'm@z.co',
      role: 'HOUSEKEEPER',
      department: 'HOUSEKEEPING',
      propertyId: 'prop-tulum-001',
      propertyName: 'Hotel Tulum',
      propertyType: 'HOTEL',
    },
  }

  describe('setAuth', () => {
    it('persiste token en SecureStore + actualiza state', async () => {
      await useAuthStore.getState().setAuth(sampleAuthResponse as any)
      expect(mockSetItemAsync).toHaveBeenCalledWith('hk_token', 'jwt-token-abc')
      const state = useAuthStore.getState()
      expect(state.token).toBe('jwt-token-abc')
      expect(state.user?.id).toBe('user-1')
      expect(state.user?.propertyId).toBe('prop-tulum-001')
    })

    it('propaga error de SecureStore (race condition)', async () => {
      mockSetItemAsync.mockRejectedValueOnce(new Error('Keychain locked') as never)
      await expect(
        useAuthStore.getState().setAuth(sampleAuthResponse as any),
      ).rejects.toThrow('Keychain locked')
    })
  })

  describe('logout', () => {
    it('limpia SecureStore + state', async () => {
      await useAuthStore.getState().setAuth(sampleAuthResponse as any)
      expect(useAuthStore.getState().token).toBe('jwt-token-abc')

      await useAuthStore.getState().logout()
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('hk_token')
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('logout sin previo setAuth — no falla', async () => {
      await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('hk_token')
    })
  })

  describe('switchProperty', () => {
    it('llama API + actualiza token + user con nueva property', async () => {
      const newAuthResponse = {
        accessToken: 'jwt-token-new',
        user: { ...sampleAuthResponse.user, propertyId: 'prop-cancun-001', propertyName: 'Hotel Cancún' },
      }
      mockPost.mockResolvedValueOnce(newAuthResponse as never)

      await useAuthStore.getState().switchProperty('prop-cancun-001')

      expect(mockPost).toHaveBeenCalledWith('/auth/switch-property', {
        targetPropertyId: 'prop-cancun-001',
      })
      expect(mockSetItemAsync).toHaveBeenCalledWith('hk_token', 'jwt-token-new')
      expect(useAuthStore.getState().token).toBe('jwt-token-new')
      expect(useAuthStore.getState().user?.propertyId).toBe('prop-cancun-001')
    })

    it('propaga error API (403 sin grant)', async () => {
      mockPost.mockRejectedValueOnce(new Error('Forbidden') as never)
      await expect(
        useAuthStore.getState().switchProperty('prop-no-access'),
      ).rejects.toThrow('Forbidden')
      expect(useAuthStore.getState().token).toBeNull()
    })

    it('Bug #24 fix — envía targetPropertyId, NO propertyId', async () => {
      mockPost.mockResolvedValueOnce(sampleAuthResponse as never)
      await useAuthStore.getState().switchProperty('prop-X')
      const callArg = mockPost.mock.calls[0][1] as { targetPropertyId: string; propertyId?: unknown }
      expect(callArg.targetPropertyId).toBe('prop-X')
      expect(callArg).not.toHaveProperty('propertyId')
    })
  })
})
