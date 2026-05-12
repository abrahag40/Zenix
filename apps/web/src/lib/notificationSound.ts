/**
 * notificationSound — tone generator para alertas auditivas del NotificationCenter.
 *
 * Sprint Mx-1B-W3 W3.5 / §56 D16 — Sistema de niveles auditivos del bell.
 *
 * Por qué Web Audio API en lugar de assets MP3:
 *   · Cero bundle size (no aumenta initial load)
 *   · Cero latencia (los assets requieren preload + cache miss en first run)
 *   · Control de envelope (attack/release) para tonos limpios sin click
 *   · Reproducible identitario — los tonos del PMS no se confunden con otros apps
 *
 * Niveles implementados (§56 D16):
 *   · soft   = nivel 2 NOTIFICATION (tono suave 1.5s, MEDIUM/HIGH priority)
 *   · urgent = nivel 2.5 ELEVATED  (dual tone 2 beeps, URGENT priority)
 *
 * Nivel 1 AMBIENT no requiere sonido (badge cesa el radar pulsante).
 * Nivel 3 ALARM (sirena continua) NO se implementa aquí — reservado para
 * emergencia física del módulo Mantenimiento (Mx-2), nunca para limpieza.
 *
 * AudioContext suspended-by-default: navegadores requieren user gesture
 * antes de play. El primer click del bell desbloquea el context. Si llega
 * un SSE antes del primer gesto del usuario, el play silenciosamente
 * falla — aceptable (operativo: el usuario interactuará en segundos).
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioCtx
}

/**
 * Desbloquea el AudioContext con un user gesture.
 * Llamar al primer click del bell — luego play() funciona libremente.
 */
export function unlockNotificationSound(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
}

export type NotificationSoundLevel = 'soft' | 'urgent'

/**
 * Reproduce el tono correspondiente al nivel.
 *
 * Pre-attentive auditory psychophysics (Bregman 1990 *Auditory Scene
 * Analysis*): tonos puros (sine) en rango 600-1000Hz son detectados
 * inmediatamente sin ser molestos. Frecuencias > 1500Hz son alarmantes
 * (sirena), reservadas para emergencias reales (§56 D16 nivel 3).
 */
export function playNotificationSound(level: NotificationSoundLevel): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    // Intenta resume y silenciosamente falla si el browser no lo permite todavía.
    void ctx.resume().catch(() => {})
  }

  const now = ctx.currentTime

  if (level === 'soft') {
    // Tono único 880Hz por 1.2s con attack/release suaves (no "click").
    // Apple system notification tone está en ~850Hz — familiar al oído.
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.10, now + 0.04)   // attack 40ms
    gain.gain.linearRampToValueAtTime(0.10, now + 0.8)    // sustain
    gain.gain.linearRampToValueAtTime(0, now + 1.2)       // release 400ms
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 1.25)
    return
  }

  // urgent — dual tone "ding-dong": 660Hz seguido de 880Hz, 2 beeps con gap.
  // Pattern reconocible de notificación urgente (Apple Mail urgent, iOS calls).
  const beeps: Array<{ freq: number; start: number }> = [
    { freq: 660, start: 0.0 },
    { freq: 880, start: 0.35 },
  ]
  for (const b of beeps) {
    const start = now + b.start
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = b.freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.14, start + 0.03) // sharp attack
    gain.gain.linearRampToValueAtTime(0.14, start + 0.20) // sustain
    gain.gain.linearRampToValueAtTime(0, start + 0.30)    // quick release
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.32)
  }
}

/**
 * Resuelve el nivel auditivo desde la priority del notif.
 * Map alineado con §56 D16 + §61 D20.
 */
export function levelFromPriority(
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
): NotificationSoundLevel | null {
  if (priority === 'URGENT') return 'urgent'
  if (priority === 'HIGH' || priority === 'MEDIUM') return 'soft'
  return null // LOW: silencioso
}
