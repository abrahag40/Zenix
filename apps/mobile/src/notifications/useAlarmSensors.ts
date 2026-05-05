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

  useEffect(() => {
    if (active) {
      Vibration.vibrate(VIBRATION_PATTERN, true)
      if (withSound) {
        player.loop = true
        player.play()
      }
    } else {
      Vibration.cancel()
      player.pause()
    }
    return () => {
      Vibration.cancel()
      player.pause()
    }
  // player es estable (useAudioPlayer) — seguro omitirlo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, withSound])
}
