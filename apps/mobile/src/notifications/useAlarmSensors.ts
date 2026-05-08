/**
 * useAlarmSensors — vibración persistente + audio de alarma en loop.
 *
 * Activa ambos cuando `active = true`; detiene al instante cuando
 * `active = false` o en unmount.
 *
 * Usado por AlarmOverlay para cualquier módulo (housekeeping, mantenimiento, …).
 *
 * Audio: expo-audio con alarm.wav (dos tonos 880 Hz / 1100 Hz, 500 ms).
 * Vibración: patrón pulsante repetido via Vibration API.
 */

import { useEffect } from 'react'
import { Vibration, Platform } from 'react-native'
import { useAudioPlayer } from 'expo-audio'

const VIBRATION_PATTERN =
  Platform.OS === 'android'
    ? [0, 350, 700, 350, 700] // Android: [delay, vib, pause, vib, pause]
    : [0, 350, 700]           // iOS: pattern corto (iOS lo clamp automáticamente)

const ALARM_SOURCE = require('../../assets/alarm.wav')

interface UseAlarmSensorsOptions {
  active: boolean
  withSound?: boolean
}

export function useAlarmSensors({
  active,
  withSound = true,
}: UseAlarmSensorsOptions): void {
  const player = useAudioPlayer(ALARM_SOURCE)

  /**
   * Stop defensivo:
   *   1. player.pause()        → detiene reproducción
   *   2. player.seekTo(0)      → resetea posición (para que próximo
   *      play() arranque desde el principio, no donde quedó)
   *   3. player.loop = false   → desactiva loop por si quedó en true
   *      cuando se llamó otra alarma encadenada
   *
   * Sin estos pasos, expo-audio en iOS puede mantener un audio session
   * activo tras pause() → el sonido continúa hasta que el sistema lo
   * detiene. Documentado en expo/expo issues #29371 y #31247.
   */
  const stopAll = () => {
    Vibration.cancel()
    try {
      player.pause()
      // Algunas versiones de expo-audio fallan silenciosamente si seekTo
      // se llama antes de que el player esté listo. Try/catch defensivo.
      if (typeof (player as any).seekTo === 'function') {
        (player as any).seekTo(0)
      }
      player.loop = false
    } catch {
      /* expo-audio puede lanzar si el source no está listo aún */
    }
  }

  useEffect(() => {
    if (active) {
      Vibration.vibrate(VIBRATION_PATTERN, true)
      if (withSound) {
        try {
          player.loop = true
          // Reset position before playing — si una alarma anterior dejó
          // el player a mitad de track, el loop comienza de la mitad.
          if (typeof (player as any).seekTo === 'function') {
            (player as any).seekTo(0)
          }
          player.play()
        } catch {
          /* defensivo */
        }
      }
    } else {
      stopAll()
    }
    return () => {
      stopAll()
    }
  // player es estable (useAudioPlayer) — seguro omitirlo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, withSound])
}
