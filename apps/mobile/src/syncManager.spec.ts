/**
 * syncManager.spec.ts — Sprint QA-α mobile.
 *
 * Cobertura para el bridge NetInfo → flushQueue.
 */
import { jest } from '@jest/globals'

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}))

jest.mock('./store/tasks', () => ({
  useTaskStore: { getState: jest.fn() },
}))

// Imports después de los mocks
import NetInfo from '@react-native-community/netinfo'
import { useTaskStore } from './store/tasks'
import { startSyncManager, stopSyncManager } from './syncManager'

const mockAddEventListener = NetInfo.addEventListener as jest.Mock
const mockGetState = (useTaskStore as unknown as { getState: jest.Mock }).getState

describe('syncManager', () => {
  let listeners: Array<(state: { isConnected: boolean; isInternetReachable: boolean }) => void>
  let mockFlushQueue: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    listeners = []
    mockFlushQueue = jest.fn()
    mockAddEventListener.mockImplementation((cb: (state: any) => void) => {
      listeners.push(cb)
      return jest.fn(() => {
        const idx = listeners.indexOf(cb)
        if (idx >= 0) listeners.splice(idx, 1)
      })
    })
    mockGetState.mockReturnValue({ syncQueue: [], flushQueue: mockFlushQueue })
    stopSyncManager() // ensure clean state
  })

  it('start subscribe a NetInfo', () => {
    startSyncManager()
    expect(mockAddEventListener).toHaveBeenCalledTimes(1)
    expect(listeners.length).toBe(1)
  })

  it('start es idempotente — segundo start no duplica handler', () => {
    startSyncManager()
    startSyncManager()
    expect(mockAddEventListener).toHaveBeenCalledTimes(1)
  })

  it('stop limpia + permite re-start', () => {
    startSyncManager()
    stopSyncManager()
    startSyncManager()
    expect(mockAddEventListener).toHaveBeenCalledTimes(2)
  })

  it('reconecta + queue con items → llama flushQueue', () => {
    mockGetState.mockReturnValue({
      syncQueue: [{ id: 'op-1' }, { id: 'op-2' }],
      flushQueue: mockFlushQueue,
    })
    startSyncManager()
    listeners[0]({ isConnected: true, isInternetReachable: true })
    expect(mockFlushQueue).toHaveBeenCalledTimes(1)
  })

  it('reconecta + queue VACÍO → no llama flush', () => {
    startSyncManager()
    listeners[0]({ isConnected: true, isInternetReachable: true })
    expect(mockFlushQueue).not.toHaveBeenCalled()
  })

  it('desconectado → no llama flush', () => {
    mockGetState.mockReturnValue({
      syncQueue: [{ id: 'op-1' }],
      flushQueue: mockFlushQueue,
    })
    startSyncManager()
    listeners[0]({ isConnected: false, isInternetReachable: false })
    expect(mockFlushQueue).not.toHaveBeenCalled()
  })

  it('conectado pero NO internet reachable → no flush (network=wifi sin gateway)', () => {
    mockGetState.mockReturnValue({
      syncQueue: [{ id: 'op-1' }],
      flushQueue: mockFlushQueue,
    })
    startSyncManager()
    listeners[0]({ isConnected: true, isInternetReachable: false })
    expect(mockFlushQueue).not.toHaveBeenCalled()
  })

  it('múltiples ciclos online/offline → flush solo en transitions OK', () => {
    mockGetState.mockReturnValue({
      syncQueue: [{ id: 'op-1' }],
      flushQueue: mockFlushQueue,
    })
    startSyncManager()
    listeners[0]({ isConnected: false, isInternetReachable: false })
    listeners[0]({ isConnected: true, isInternetReachable: true })
    listeners[0]({ isConnected: false, isInternetReachable: false })
    listeners[0]({ isConnected: true, isInternetReachable: true })
    expect(mockFlushQueue).toHaveBeenCalledTimes(2)
  })
})
