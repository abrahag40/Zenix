/**
 * QA-α — Cobertura del data pool de celebraciones.
 *
 * `celebrationPool.ts` no tiene lógica, pero el contenido tiene reglas duras
 * derivadas del research-housekeeping-hub.md §2.4 + §5.3 (Skinner / Mekler):
 *
 *   1. IDs únicos (engine usa `id` para anti-repeat de últimos 5)
 *   2. Cada categoría tiene mínimo de mensajes para soportar VR + no-repeat
 *   3. `tone` siempre dentro del set { soft, warm, celebratory }
 *   4. `category` siempre dentro del enum declarado
 *   5. `text` no vacío (un mensaje vacío rompe el toast)
 *
 * Un drift silencioso en este pool (typo de category, id duplicado tras añadir
 * variantes en Sprint 8K) puede causar bugs sutiles en producción donde el
 * engine repite mensajes o crashea silencioso. Tests previenen esto.
 */
import { CELEBRATION_POOL, type CelebrationCategory } from './celebrationPool'

const VALID_CATEGORIES: CelebrationCategory[] = [
  'recognition',
  'encouragement',
  'personalRecord',
  'streakMilestone',
  'dayCompletion',
  'comeback',
]

const VALID_TONES = ['soft', 'warm', 'celebratory']

describe('CELEBRATION_POOL — integridad del data set', () => {
  it('exporta un array no vacío', () => {
    expect(Array.isArray(CELEBRATION_POOL)).toBe(true)
    expect(CELEBRATION_POOL.length).toBeGreaterThan(0)
  })

  it('todos los IDs son únicos (engine usa id para anti-repeat de últimos 5)', () => {
    const ids = CELEBRATION_POOL.map((m) => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('cada mensaje tiene id no vacío + text no vacío', () => {
    for (const m of CELEBRATION_POOL) {
      expect(m.id.length).toBeGreaterThan(0)
      expect(m.text.length).toBeGreaterThan(0)
    }
  })

  it('todas las categorías están dentro del enum declarado (no typos)', () => {
    for (const m of CELEBRATION_POOL) {
      expect(VALID_CATEGORIES).toContain(m.category)
    }
  })

  it('todos los tones están dentro del set { soft, warm, celebratory }', () => {
    for (const m of CELEBRATION_POOL) {
      expect(VALID_TONES).toContain(m.tone)
    }
  })
})

describe('CELEBRATION_POOL — disciplina por categoría (research §5.3)', () => {
  it('recognition tiene ≥10 mensajes (rotación base ~60% triggers, anti-repeat 5)', () => {
    // research §1.2: 60% recognition, anti-repeat últimos 5 → necesita pool >5.
    // §5.3 sprint 8I fija 15 ítems para evitar fatiga.
    const recognition = CELEBRATION_POOL.filter((m) => m.category === 'recognition')
    expect(recognition.length).toBeGreaterThanOrEqual(10)
  })

  it('encouragement tiene ≥6 mensajes (mid-shift triggers)', () => {
    const enc = CELEBRATION_POOL.filter((m) => m.category === 'encouragement')
    expect(enc.length).toBeGreaterThanOrEqual(6)
  })

  it('personalRecord tiene ≥3 mensajes (deterministic trigger, anti-repeat 5 igual aplica)', () => {
    const pr = CELEBRATION_POOL.filter((m) => m.category === 'personalRecord')
    expect(pr.length).toBeGreaterThanOrEqual(3)
  })

  it('streakMilestone tiene ≥3 mensajes (milestones 3/7/14/30/60/100)', () => {
    const sm = CELEBRATION_POOL.filter((m) => m.category === 'streakMilestone')
    expect(sm.length).toBeGreaterThanOrEqual(3)
  })

  it('dayCompletion tiene ≥3 mensajes (cierre de día, ritual)', () => {
    const dc = CELEBRATION_POOL.filter((m) => m.category === 'dayCompletion')
    expect(dc.length).toBeGreaterThanOrEqual(3)
  })

  it('comeback tiene ≥1 mensaje (rachas rotas)', () => {
    const cb = CELEBRATION_POOL.filter((m) => m.category === 'comeback')
    expect(cb.length).toBeGreaterThanOrEqual(1)
  })
})

describe('CELEBRATION_POOL — tono consistente con categoría', () => {
  it('recognition usa solo tonos soft/warm (NO celebratory — sería excesivo)', () => {
    const recognition = CELEBRATION_POOL.filter((m) => m.category === 'recognition')
    for (const m of recognition) {
      expect(['soft', 'warm']).toContain(m.tone)
    }
  })

  it('personalRecord puede usar tono celebratory (deterministic, valor alto)', () => {
    const pr = CELEBRATION_POOL.filter((m) => m.category === 'personalRecord')
    // Al menos uno debe ser celebratory para diferenciarse del recognition base.
    const hasCelebratory = pr.some((m) => m.tone === 'celebratory')
    expect(hasCelebratory).toBe(true)
  })
})
