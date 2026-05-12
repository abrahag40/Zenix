/**
 * useShakeOnInvalid — primitiva del estándar §60 D19 CLAUDE.md (mobile).
 *
 * Patrón Meta/Apple/Stripe/Linear: el botón SIEMPRE habilitado. Al tap-ear
 * submit con input inválido → shake horizontal + haptic error + mensaje
 * inline. NUNCA `disabled={value.length < N}` para validar input.
 *
 * Uso:
 *   const { shakeStyle, trigger } = useShakeOnInvalid()
 *   function handleSubmit() {
 *     if (value.trim().length < 5) {
 *       setError('Mínimo 5 caracteres')
 *       trigger()
 *       return
 *     }
 *     onSubmit(value)
 *   }
 *   // En el JSX:
 *   <Animated.View style={[styles.inputWrap, shakeStyle]}>
 *     <TextInput ... />
 *   </Animated.View>
 *   <Pressable onPress={handleSubmit}>...</Pressable>  // SIN disabled
 *
 * El shake usa Reanimated `withSequence` de 5 timings (~400ms total),
 * acompañado de `Haptics.notificationAsync(Error)` para feedback táctil
 * — clave en mobile donde el usuario puede no estar mirando la pantalla
 * (manos sucias, poca luz, guantes).
 */
import { useCallback } from 'react'
import * as Haptics from 'expo-haptics'
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

export function useShakeOnInvalid() {
  const translateX = useSharedValue(0)

  const trigger = useCallback(() => {
    // Haptic primero — es lo más perceptible aunque el usuario no esté mirando.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    // 5 oscilaciones de 80ms (~400ms total), curva sharp para sensación de "error".
    const t = (v: number) =>
      withTiming(v, { duration: 60, easing: Easing.bezier(0.36, 0.07, 0.19, 0.97) })
    translateX.value = withSequence(t(-4), t(4), t(-3), t(3), t(0))
  }, [translateX])

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  return { shakeStyle, trigger }
}
