/**
 * useTaskAlarm — vibración persistente + sonido de alarma en loop.
 *
 * Activa vibración + audio cuando `active = true`.
 * Para inmediatamente cuando `active = false` o en unmount.
 *
 * Audio: expo-audio con alarm.wav (2 tonos 880 Hz / 1100 Hz, 500 ms).
 * Vibración: patrón pulsante repetido via Vibration API.
 *
 * Justificación: la recamarista puede tener audífonos o estar en un
 * ambiente ruidoso (aspiradora). La combinación audio + vibración
 * garantiza que no se pierda una habitación lista — patrón estándar
 * de apps de delivery (Uber Eats, Rappi) al recibir un pedido.
 */

import { useEffect } from 'react'
import { Vibration, Platform } from 'react-native'
import { useAudioPlayer } from 'expo-audio'

// Vibration pattern — short pulse + gap, repeats indefinitely.
const VIBRATION_PATTERN = Platform.OS === 'android'
  ? [0, 350, 700, 350, 700]   // Android: [delay, vib, pause, vib, pause]
  : [0, 350, 700]              // iOS: pattern shorter (iOS clamps automatically)

// Load asset at module level for stable reference.
const ALARM_SOURCE = require('../../../../assets/alarm.wav')

interface UseTaskAlarmOptions {
  /** When true, alarm starts. When false, stops + cleans up. */
  active: boolean
  /** Whether to play the audible alarm too. Default true. */
  withSound?: boolean
}

export function useTaskAlarm({ active, withSound = true }: UseTaskAlarmOptions): void {
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
  // player reference is stable from useAudioPlayer — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, withSound])
}
