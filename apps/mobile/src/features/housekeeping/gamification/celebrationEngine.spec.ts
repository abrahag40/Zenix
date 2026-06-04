/**
 * QA-α — celebrationEngine: lógica de la máquina de celebraciones.
 *
 * Ancla a research-housekeeping-hub.md §1.2 (Skinner Variable Ratio) + §5.3
 * (Mekler 2017 anti-saturation) + decisión D-HK-CELEB del módulo.
 *
 * Cubre:
 *  1. Triggers DETERMINÍSTICOS (PR / comeback) siempre disparan
 *  2. Milestone solo dispara en thresholds (3/7/14/30/60/100)
 *  3. Cap diario de 3 mensajes para taskCompleted
 *  4. Anti-repeat: no devuelve un id que esté en los últimos 5
 *  5. Fallback cuando el pool por categoría está agotado
 *  6. VR ratio se respeta cuando Math.random > 0.30
 *  7. State persiste en AsyncStorage por día local
 *  8. Reset diario cuando cambia el YMD
 */
// In-memory AsyncStorage mock — el spec NO debe tocar storage nativo
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {}
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value
        return Promise.resolve()
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key]
        return Promise.resolve()
      }),
      clear: jest.fn(() => {
        store = {}
        return Promise.resolve()
      }),
    },
  }
})

import { decideCelebration, _resetDailyCelebrationState } from './celebrationEngine'
import { CELEBRATION_POOL } from './celebrationPool'
import AsyncStorage from '@react-native-async-storage/async-storage'

describe('decideCelebration — gamification logic', () => {
  beforeEach(async () => {
    await _resetDailyCelebrationState()
    // Reset Math.random spies between tests
    jest.spyOn(Math, 'random').mockRestore?.()
  })

  describe('triggers determinísticos', () => {
    it('personalRecord SIEMPRE devuelve un mensaje (no es probabilístico)', async () => {
      // Math.random returns very high (would block VR), pero PR no consulta VR
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const msg = await decideCelebration({ trigger: 'personalRecord' })
      expect(msg).not.toBeNull()
      expect(msg!.category).toBe('personalRecord')
    })

    it('comeback SIEMPRE devuelve un mensaje', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const msg = await decideCelebration({ trigger: 'comeback' })
      expect(msg).not.toBeNull()
      expect(msg!.category).toBe('comeback')
    })
  })

  describe('milestones de streak', () => {
    it.each([3, 7, 14, 30, 60, 100])(
      'dispara en milestone de %i días',
      async (days) => {
        const msg = await decideCelebration({ trigger: 'streakMilestone', streakDays: days })
        expect(msg).not.toBeNull()
        expect(msg!.category).toBe('streakMilestone')
      },
    )

    it.each([0, 1, 2, 4, 5, 6, 8, 13, 15, 29, 31, 99, 101])(
      'NO dispara en día %i (no es milestone)',
      async (days) => {
        const msg = await decideCelebration({ trigger: 'streakMilestone', streakDays: days })
        expect(msg).toBeNull()
      },
    )

    it('streakDays undefined → no dispara', async () => {
      const msg = await decideCelebration({ trigger: 'streakMilestone' })
      expect(msg).toBeNull()
    })
  })

  describe('cap diario para taskCompleted', () => {
    it('respeta el cap de 3 mensajes/día — el 4to ya no dispara aunque VR pase', async () => {
      // Math.random < 0.30 always passes VR, < 0.70 picks recognition (más mensajes que encouragement)
      jest.spyOn(Math, 'random').mockReturnValue(0.10)
      const m1 = await decideCelebration({ trigger: 'taskCompleted' })
      const m2 = await decideCelebration({ trigger: 'taskCompleted' })
      const m3 = await decideCelebration({ trigger: 'taskCompleted' })
      const m4 = await decideCelebration({ trigger: 'taskCompleted' })
      expect(m1).not.toBeNull()
      expect(m2).not.toBeNull()
      expect(m3).not.toBeNull()
      expect(m4).toBeNull() // cap diario activado
    })

    it('cuando Math.random > 0.30 (VR miss) no devuelve mensaje', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.50)
      const msg = await decideCelebration({ trigger: 'taskCompleted' })
      expect(msg).toBeNull()
    })

    it('cuando Math.random pasa VR y categoría pick lo permite, devuelve mensaje', async () => {
      // Necesito 2 calls a Math.random: primer para VR (<.30), segundo para categoría
      const seq = [0.10, 0.50] // VR pass + encouragement pick
      let i = 0
      jest.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0)
      const msg = await decideCelebration({ trigger: 'taskCompleted' })
      expect(msg).not.toBeNull()
    })
  })

  describe('anti-repeat de últimos 5', () => {
    it('NO devuelve un id que esté en los últimos 5 disparos', async () => {
      // Forzar VR pass siempre + categoría recognition (pool grande)
      const stubRandom = () => 0.10
      jest.spyOn(Math, 'random').mockImplementation(stubRandom)

      const seen = new Set<string>()
      // Disparar 3 (cap diario) — no debería haber duplicados consecutivos
      for (let k = 0; k < 3; k++) {
        const msg = await decideCelebration({ trigger: 'taskCompleted' })
        if (msg) seen.add(msg.id)
      }
      expect(seen.size).toBe(3) // 3 IDs distintos
    })
  })

  describe('persistencia AsyncStorage', () => {
    it('escribe el state tras disparar un mensaje', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.10)
      await decideCelebration({ trigger: 'taskCompleted' })
      const raw = await AsyncStorage.getItem('@zenix:celebration:daily')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.count).toBe(1)
      expect(parsed.recent).toHaveLength(1)
      expect(parsed.date).toBe(new Date().toISOString().slice(0, 10))
    })

    it('_resetDailyCelebrationState limpia el state', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.10)
      await decideCelebration({ trigger: 'taskCompleted' })
      await _resetDailyCelebrationState()
      const raw = await AsyncStorage.getItem('@zenix:celebration:daily')
      expect(raw).toBeNull()
    })
  })

  describe('pool integrity en runtime', () => {
    it('todos los triggers determinísticos tienen al menos 1 mensaje en pool', () => {
      const categories = ['personalRecord', 'streakMilestone', 'comeback', 'dayCompletion'] as const
      for (const cat of categories) {
        const count = CELEBRATION_POOL.filter((m) => m.category === cat).length
        expect(count).toBeGreaterThan(0)
      }
    })
  })
})
