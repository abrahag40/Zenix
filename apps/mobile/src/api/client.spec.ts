/**
 * client.spec.ts — Sprint QA-α mobile.
 *
 * Cobertura HTTP client crítico mobile:
 *  - Auth header de SecureStore
 *  - Content-Type automático vs FormData
 *  - Success / 204 / 4xx / 5xx
 *  - Timeout → NetworkError
 *  - GET retry, POST no retry, ApiError no retry
 */
import { jest } from '@jest/globals'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {}, hostUri: '192.168.1.10:8081' },
    expoGoConfig: { debuggerHost: '192.168.1.10:8081' },
  },
}))

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

import * as SecureStore from 'expo-secure-store'

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock
const mockFetch = jest.fn() as jest.Mock
;(globalThis as any).fetch = mockFetch

import { api, ApiError, NetworkError } from './client'

describe('api client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetItemAsync.mockResolvedValue('jwt-token-abc' as never)
  })

  const mockOk = (body: unknown, status = 200) =>
    ({
      ok: true,
      status,
      statusText: 'OK',
      json: async () => body,
    } as unknown as Response)

  const mockErr = (status: number, body: unknown) =>
    ({
      ok: false,
      status,
      statusText: 'Error',
      json: async () => body,
    } as unknown as Response)

  describe('Auth header', () => {
    it('GET attaches Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({ ok: true }) as never)
      await api.get('/v1/foo')
      const callOpts = mockFetch.mock.calls[0][1] as { headers: Headers }
      expect(callOpts.headers.get('Authorization')).toBe('Bearer jwt-token-abc')
    })

    it('skipAuth=true omits Authorization', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({ ok: true }) as never)
      await api.get('/v1/foo', { skipAuth: true })
      const callOpts = mockFetch.mock.calls[0][1] as { headers: Headers }
      expect(callOpts.headers.get('Authorization')).toBeNull()
    })

    it('no token → sin header', async () => {
      mockGetItemAsync.mockResolvedValueOnce(null as never)
      mockFetch.mockResolvedValueOnce(mockOk({ ok: true }) as never)
      await api.get('/v1/foo')
      const callOpts = mockFetch.mock.calls[0][1] as { headers: Headers }
      expect(callOpts.headers.get('Authorization')).toBeNull()
    })

    it('SecureStore throws → graceful fallback', async () => {
      mockGetItemAsync.mockRejectedValueOnce(new Error('Keychain locked') as never)
      mockFetch.mockResolvedValueOnce(mockOk({ ok: true }) as never)
      await api.get('/v1/foo')
      const callOpts = mockFetch.mock.calls[0][1] as { headers: Headers }
      expect(callOpts.headers.get('Authorization')).toBeNull()
    })
  })

  describe('Content-Type', () => {
    it('JSON body → application/json automático', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({ ok: true }) as never)
      await api.post('/v1/foo', { x: 1 })
      const callOpts = mockFetch.mock.calls[0][1] as { headers: Headers }
      expect(callOpts.headers.get('Content-Type')).toBe('application/json')
    })
  })

  describe('Response handling', () => {
    it('200 OK → retorna body', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({ id: 'foo' }) as never)
      const result = await api.get<{ id: string }>('/v1/foo')
      expect(result).toEqual({ id: 'foo' })
    })

    it('204 No Content → undefined', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({}, 204) as never)
      const result = await api.delete('/v1/foo')
      expect(result).toBeUndefined()
    })

    it('400 con message string → ApiError', async () => {
      mockFetch.mockResolvedValueOnce(mockErr(400, { message: 'Algo salió mal' }) as never)
      try {
        await api.get('/v1/foo')
        fail('debió tirar')
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
        expect((e as ApiError).status).toBe(400)
        expect((e as ApiError).message).toBe('Algo salió mal')
      }
    })

    it('400 con message array (NestJS) → primer mensaje', async () => {
      mockFetch.mockResolvedValueOnce(mockErr(400, { message: ['validation A', 'validation B'] }) as never)
      try {
        await api.get('/v1/foo')
        fail('debió tirar')
      } catch (e) {
        expect((e as ApiError).message).toBe('validation A')
      }
    })

    it('500 sin message → usa statusText', async () => {
      mockFetch.mockResolvedValueOnce(mockErr(500, {}) as never)
      try {
        await api.get('/v1/foo')
        fail('debió tirar')
      } catch (e) {
        expect((e as ApiError).message).toBe('Error')
        expect((e as ApiError).status).toBe(500)
      }
    })
  })

  describe('Network errors + timeout', () => {
    it('AbortError → NetworkError "tardó demasiado"', async () => {
      const abortErr = new Error('abort')
      abortErr.name = 'AbortError'
      mockFetch.mockRejectedValueOnce(abortErr as never)
      try {
        await api.get('/v1/foo', { retries: 0 })
        fail('debió tirar')
      } catch (e) {
        expect(e).toBeInstanceOf(NetworkError)
        expect((e as NetworkError).message).toContain('tardó demasiado')
      }
    })

    it('generic network error → NetworkError "No pudimos conectar"', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED') as never)
      try {
        await api.get('/v1/foo', { retries: 0 })
        fail('debió tirar')
      } catch (e) {
        expect(e).toBeInstanceOf(NetworkError)
        expect((e as NetworkError).message).toContain('No pudimos conectar')
      }
    })
  })

  describe('Retry policy', () => {
    it('GET retry 2× por default si NetworkError', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED') as never)
        .mockRejectedValueOnce(new Error('ECONNREFUSED') as never)
        .mockResolvedValueOnce(mockOk({ ok: true }) as never)
      const result = await api.get('/v1/foo')
      expect(result).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('POST NO retry por default', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED') as never)
      try {
        await api.post('/v1/foo', { x: 1 })
        fail('debió tirar')
      } catch {
        // expected
      }
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('POST con retries opt-in', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED') as never)
        .mockResolvedValueOnce(mockOk({ ok: true }) as never)
      const result = await api.post('/v1/foo', {}, { retries: 1 })
      expect(result).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('ApiError NUNCA se retry', async () => {
      mockFetch.mockResolvedValue(mockErr(400, { message: 'bad' }) as never)
      try {
        await api.get('/v1/foo')
        fail('debió tirar')
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
      }
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
