/**
 * Pool de mensajes celebratorios — Capa 2 STANDARD.
 *
 * Anclado a docs/research-housekeeping-hub.md §2.4 + §5.3.
 *
 * Tono:
 *   - Profesional + cálido (no infantil, no corporativo frío)
 *   - Adulto laboral, NO un personaje de videojuego
 *   - Reconocimiento del trabajo, nunca presión
 *
 * Diseño:
 *   - Variable Ratio Reinforcement (Skinner): solo ~30% de los completes
 *     disparan mensaje. El otro 70% es feedback básico (✓ + haptic).
 *   - Cap diario: máximo 3 mensajes por sesión para evitar
 *     desensibilización (Mekler 2017).
 *   - No repetir últimos 5 mensajes (evita patrón aburrido).
 *
 * Sprint 8I: ~60 mensajes. Sprint 8K: 300+ con variantes contextuales.
 *
 * Categorías:
 *   recognition  — confirma el trabajo bien hecho
 *   encouragement — anima sin presionar
 *   personalRecord — solo cuando hay PR real
 *   streakMilestone — 3, 7, 14, 30, 60, 100 días
 *   dayCompletion — al cerrar el día
 *   comeback — al volver tras rachas rotas
 */

export type CelebrationCategory =
  | 'recognition'
  | 'encouragement'
  | 'personalRecord'
  | 'streakMilestone'
  | 'dayCompletion'
  | 'comeback'

export interface CelebrationMessage {
  id: string
  text: string
  /** Optional emoji prefix — kept SUBTLE per research §2.7. */
  emoji?: string
  category: CelebrationCategory
  /** Tone hint for haptic intensity selection. */
  tone: 'soft' | 'warm' | 'celebratory'
}

/**
 * RECOGNITION (15) — base of the rotation. Plain confirmation that the
 * room is well done. Used for ~60% of celebration triggers.
 */
const RECOGNITION: CelebrationMessage[] = [
  { id: 'rec-01', text: 'Otra habitación lista, gracias.',           category: 'recognition', tone: 'soft' },
  { id: 'rec-02', text: 'Hab. lista. Buen trabajo.',                 category: 'recognition', tone: 'soft' },
  { id: 'rec-03', text: 'Limpieza completa.',                        category: 'recognition', tone: 'soft', emoji: '✓' },
  { id: 'rec-04', text: 'Habitación entregada — gracias.',           category: 'recognition', tone: 'soft' },
  { id: 'rec-05', text: 'Bien hecho.',                               category: 'recognition', tone: 'warm' },
  { id: 'rec-06', text: 'Lista para el próximo huésped.',            category: 'recognition', tone: 'soft' },
  { id: 'rec-07', text: 'Una más completada.',                       category: 'recognition', tone: 'soft' },
  { id: 'rec-08', text: 'Gracias por el detalle.',                   category: 'recognition', tone: 'warm' },
  { id: 'rec-09', text: 'Habitación lista, en tiempo.',              category: 'recognition', tone: 'warm' },
  { id: 'rec-10', text: 'Excelente.',                                category: 'recognition', tone: 'warm', emoji: '✓' },
  { id: 'rec-11', text: 'Lista. Sigue así.',                         category: 'recognition', tone: 'soft' },
  { id: 'rec-12', text: 'Habitación marcada como limpia.',           category: 'recognition', tone: 'soft' },
  { id: 'rec-13', text: 'Buen pulso.',                               category: 'recognition', tone: 'warm' },
  { id: 'rec-14', text: 'Lista — gracias por el cuidado.',           category: 'recognition', tone: 'warm' },
  { id: 'rec-15', text: 'Otra hecha.',                               category: 'recognition', tone: 'soft' },
]

/**
 * ENCOURAGEMENT (12) — gentle motivational nudges. Mid-shift triggers.
 */
const ENCOURAGEMENT: CelebrationMessage[] = [
  { id: 'enc-01', text: 'Vas con buen ritmo.',                       category: 'encouragement', tone: 'warm' },
  { id: 'enc-02', text: 'Buen trabajo del día.',                     category: 'encouragement', tone: 'warm' },
  { id: 'enc-03', text: 'Sigues firme.',                             category: 'encouragement', tone: 'soft' },
  { id: 'enc-04', text: 'Eficiencia consistente hoy.',               category: 'encouragement', tone: 'warm' },
  { id: 'enc-05', text: 'Buen criterio de limpieza.',                category: 'encouragement', tone: 'warm' },
  { id: 'enc-06', text: 'Avance fluido del turno.',                  category: 'encouragement', tone: 'soft' },
  { id: 'enc-07', text: 'Constante hoy.',                            category: 'encouragement', tone: 'soft' },
  { id: 'enc-08', text: 'Tu turno avanza bien.',                     category: 'encouragement', tone: 'warm' },
  { id: 'enc-09', text: 'Dedicación que se nota.',                   category: 'encouragement', tone: 'warm' },
  { id: 'enc-10', text: 'Buena cadencia.',                           category: 'encouragement', tone: 'soft' },
  { id: 'enc-11', text: 'Vas como reloj.',                           category: 'encouragement', tone: 'warm' },
  { id: 'enc-12', text: 'Bien manejado.',                            category: 'encouragement', tone: 'soft' },
]

/**
 * PERSONAL RECORD (8) — only fires when actual PR is set. The single
 * most rewarding category neurologically (Strava insight).
 */
const PERSONAL_RECORD: CelebrationMessage[] = [
  { id: 'pr-01', text: 'Récord personal nuevo.',                     category: 'personalRecord', tone: 'celebratory', emoji: '★' },
  { id: 'pr-02', text: 'Tu mejor tiempo en este tipo de habitación.', category: 'personalRecord', tone: 'celebratory', emoji: '★' },
  { id: 'pr-03', text: 'Marca personal — bien hecho.',               category: 'personalRecord', tone: 'celebratory', emoji: '★' },
  { id: 'pr-04', text: 'Superaste tu propio tiempo.',                category: 'personalRecord', tone: 'celebratory', emoji: '⚡' },
  { id: 'pr-05', text: 'Nuevo récord personal.',                     category: 'personalRecord', tone: 'celebratory', emoji: '★' },
  { id: 'pr-06', text: 'Más eficiente que tu mejor turno previo.',   category: 'personalRecord', tone: 'celebratory', emoji: '⚡' },
  { id: 'pr-07', text: 'Tiempo récord — solo tú lo bates.',          category: 'personalRecord', tone: 'celebratory', emoji: '★' },
  { id: 'pr-08', text: 'PR. Sigues afinando tu técnica.',            category: 'personalRecord', tone: 'celebratory', emoji: '★' },
]

/**
 * STREAK MILESTONE (10) — fires at 3, 7, 14, 30, 60, 100 days.
 * Days are passed in via {{days}} template at render time.
 */
const STREAK_MILESTONE: CelebrationMessage[] = [
  { id: 'sm-01', text: '3 días seguidos. Buen ritmo de la semana.',        category: 'streakMilestone', tone: 'warm' },
  { id: 'sm-02', text: 'Una semana completa de constancia.',                category: 'streakMilestone', tone: 'celebratory', emoji: '🌱' },
  { id: 'sm-03', text: '14 días seguidos — eso requiere disciplina.',       category: 'streakMilestone', tone: 'celebratory', emoji: '🌿' },
  { id: 'sm-04', text: 'Un mes consistente.',                               category: 'streakMilestone', tone: 'celebratory', emoji: '🌳' },
  { id: 'sm-05', text: '60 días. Pocos llegan acá.',                        category: 'streakMilestone', tone: 'celebratory', emoji: '🏆' },
  { id: 'sm-06', text: '100 días. Eso ya es identidad de trabajo.',         category: 'streakMilestone', tone: 'celebratory', emoji: '🏆' },
  { id: 'sm-07', text: 'Otra racha de 7 — sigues firme.',                   category: 'streakMilestone', tone: 'warm', emoji: '🌱' },
  { id: 'sm-08', text: 'Récord de racha personal — superaste tu mejor.',    category: 'streakMilestone', tone: 'celebratory', emoji: '★' },
  { id: 'sm-09', text: 'Constancia que se nota.',                           category: 'streakMilestone', tone: 'warm' },
  { id: 'sm-10', text: 'Así se construye.',                                 category: 'streakMilestone', tone: 'warm' },
]

/**
 * DAY COMPLETION (10) — when all rings closed. 1×/day max.
 * Uses {{firstName}} template for warmth without infantilizing.
 */
const DAY_COMPLETION: CelebrationMessage[] = [
  { id: 'dc-01', text: 'Día cerrado. Buena tarde.',                  category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-02', text: 'Listo. Gracias por hoy.',                    category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-03', text: 'Día completo. Descansa.',                    category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-04', text: 'Turno cerrado con éxito.',                   category: 'dayCompletion', tone: 'celebratory' },
  { id: 'dc-05', text: 'Día completado. Bien hecho.',                category: 'dayCompletion', tone: 'celebratory' },
  { id: 'dc-06', text: 'Tres anillos cerrados. Buen día.',           category: 'dayCompletion', tone: 'celebratory' },
  { id: 'dc-07', text: 'Día listo. Hasta mañana.',                   category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-08', text: 'Trabajo completado. Buen descanso.',         category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-09', text: 'Cerrado el día con todo en orden.',          category: 'dayCompletion', tone: 'warm' },
  { id: 'dc-10', text: 'Día redondo.',                               category: 'dayCompletion', tone: 'celebratory' },
]

/**
 * COMEBACK (5) — first task after a broken streak. Crucial to NOT
 * shame the loss (loss aversion would create anxiety). Welcome back.
 */
const COMEBACK: CelebrationMessage[] = [
  { id: 'cb-01', text: 'Volviste — empezamos limpio.',                category: 'comeback', tone: 'warm' },
  { id: 'cb-02', text: 'Bienvenida de nuevo.',                       category: 'comeback', tone: 'warm' },
  { id: 'cb-03', text: 'Nueva racha empieza hoy.',                   category: 'comeback', tone: 'warm', emoji: '🌱' },
  { id: 'cb-04', text: 'Hoy es día 1 — vamos.',                      category: 'comeback', tone: 'warm', emoji: '🌱' },
  { id: 'cb-05', text: 'Empezamos otra vez. Sin presión.',           category: 'comeback', tone: 'soft' },
]

export const CELEBRATION_POOL: CelebrationMessage[] = [
  ...RECOGNITION,
  ...ENCOURAGEMENT,
  ...PERSONAL_RECORD,
  ...STREAK_MILESTONE,
  ...DAY_COMPLETION,
  ...COMEBACK,
]

/**
 * Filter by category — used by the engine to scope the random pick.
 */
export function poolByCategory(category: CelebrationCategory): CelebrationMessage[] {
  return CELEBRATION_POOL.filter((m) => m.category === category)
}
