/**
 * Celebration engine — Variable Ratio Reinforcement con guard-rails.
 *
 * Anclado a research-housekeeping-hub.md §1.2 (Skinner) + §5.3 reglas:
 *
 *   1. Variable ratio ~30% (3 de cada 10 completes disparan mensaje)
 *   2. Cap 3 mensajes/día (anti-saturación, Mekler 2017)
 *   3. No repetir últimos 5 mensajes (anti-pattern)
 *   4. Categoría 'personalRecord' siempre dispara cuando hay PR real
 *      (no random — es trigger determinístico)
 *   5. Categoría 'streakMilestone' siempre dispara en milestones
 *
 * Engine state vive in-memory por sesión + persiste en AsyncStorage el
 * counter del día (para el cap diario incluso si la app se reinicia).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  CELEBRATION_POOL,
  type CelebrationMessage,
  type CelebrationCategory,
} from './celebrationPool'

const STORAGE_KEY = '@zenix:celebration:daily'
const MAX_DAILY_MESSAGES = 3
const VARIABLE_RATIO_HIT_PCT = 0.30
const RECENT_HISTORY_SIZE = 5

interface DailyState {
  date: string  // ISO YMD
  count: number
  recent: string[] // last N message ids
}

async function loadState(): Promise<DailyState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DailyState
      // Reset if it's a new local day
      if (parsed.date === todayYMD()) return parsed
    }
  } catch {
    // ignore corrupted state
  }
  return { date: todayYMD(), count: 0, recent: [] }
}

async function saveState(s: DailyState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // best-effort
  }
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10)
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Decide whether to show a celebration message and which one.
 *
 * Args:
 *   trigger — distinguishes deterministic triggers (PR, milestone)
 *             from probabilistic ones (recognition).
 *
 * Returns:
 *   The message to render OR null if no celebration this time.
 */
export interface CelebrationDecisionInput {
  trigger:
    | 'taskCompleted'        // probabilistic — VR 30%
    | 'personalRecord'       // deterministic — always (when PR is real)
    | 'streakMilestone'      // deterministic — always
    | 'dayCompletion'        // deterministic — exactly 1×/day
    | 'comeback'             // deterministic — first task after broken streak
  /** Streak day count for milestone trigger. */
  streakDays?: number
}

export async function decideCelebration(
  input: CelebrationDecisionInput,
): Promise<CelebrationMessage | null> {
  const state = await loadState()

  // Day-completion: exactly once per day
  if (input.trigger === 'dayCompletion') {
    if (state.count >= MAX_DAILY_MESSAGES + 1) return null
    const msg = pickFresh('dayCompletion', state.recent)
    if (msg) await commit(state, msg)
    return msg
  }

  // PR + comeback always fire (rare events)
  if (input.trigger === 'personalRecord') {
    const msg = pickFresh('personalRecord', state.recent)
    if (msg) await commit(state, msg)
    return msg
  }
  if (input.trigger === 'comeback') {
    const msg = pickFresh('comeback', state.recent)
    if (msg) await commit(state, msg)
    return msg
  }

  // Streak milestones — only at thresholds
  if (input.trigger === 'streakMilestone') {
    const days = input.streakDays ?? 0
    const milestones = [3, 7, 14, 30, 60, 100]
    if (!milestones.includes(days)) return null
    const msg = pickFresh('streakMilestone', state.recent)
    if (msg) await commit(state, msg)
    return msg
  }

  // Probabilistic (taskCompleted) — VR with cap
  if (state.count >= MAX_DAILY_MESSAGES) return null
  if (Math.random() > VARIABLE_RATIO_HIT_PCT) return null
  // 70/30 split between recognition / encouragement
  const cat: CelebrationCategory =
    Math.random() < 0.70 ? 'recognition' : 'encouragement'
  const msg = pickFresh(cat, state.recent)
  if (msg) await commit(state, msg)
  return msg
}

function pickFresh(
  category: CelebrationCategory,
  recent: string[],
): CelebrationMessage | null {
  const candidates = CELEBRATION_POOL.filter(
    (m) => m.category === category && !recent.includes(m.id),
  )
  if (candidates.length === 0) {
    // Pool exhausted recently — fall back to broader category, ignoring history
    const all = CELEBRATION_POOL.filter((m) => m.category === category)
    return pickRandom(all)
  }
  return pickRandom(candidates)
}

async function commit(state: DailyState, msg: CelebrationMessage): Promise<void> {
  const recent = [msg.id, ...state.recent].slice(0, RECENT_HISTORY_SIZE)
  await saveState({
    date: state.date,
    count: state.count + 1,
    recent,
  })
}

/**
 * Reset the daily counter — exposed for testing and "reset celebration"
 * action in dev menu.
 */
export async function _resetDailyCelebrationState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
