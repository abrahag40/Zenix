import { Alert, Platform } from 'react-native'

/**
 * Confirmación cross-platform (QA-12, 2026-06-09).
 *
 * `Alert.alert(title, msg, [botones])` NO ejecuta los callbacks de los botones
 * en Expo **web** (el polyfill web de RN ignora el array de botones) → cualquier
 * acción detrás de un "Confirmar" quedaba muerta en web (caso: "Finalizar
 * limpieza" no completaba la tarea). En web usamos `window.confirm`; en nativo
 * conservamos el `Alert.alert` con sus dos botones.
 *
 * Devuelve `true` si el usuario confirmó, `false` si canceló.
 */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)
    return Promise.resolve(!!ok)
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ])
  })
}
