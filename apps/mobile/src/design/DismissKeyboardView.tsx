/**
 * DismissKeyboardView — wrapper que oculta el teclado al tocar fuera de
 * cualquier input.
 *
 * Patrón Apple HIG estándar (iOS Notes, Messages, Settings, Mail):
 *  · Tap en zona NO interactiva → `Keyboard.dismiss()`
 *  · Para single-line inputs: `returnKeyType="done"` (manejado en cada input)
 *  · Para multi-line: tap-outside es el único dismiss (newline tiene prioridad)
 *
 * Uso:
 *   <DismissKeyboardView style={{ flex: 1 }}>
 *     <ScrollView>...</ScrollView>
 *   </DismissKeyboardView>
 *
 * Nota: NO conflicta con `ScrollView keyboardShouldPersistTaps="handled"` —
 * ese prop sirve para que UN tap en otro botón funcione mientras el teclado
 * está abierto (sin requerir doble tap). Nuestro wrapper se encarga del
 * tap-en-vacío.
 *
 * Decisión: usar `TouchableWithoutFeedback` en vez de `Pressable` porque
 * `TouchableWithoutFeedback` NO compite por gestures con scroll views ni
 * con presses dentro de su contenido (transparente para el touch event).
 */
import { Keyboard, TouchableWithoutFeedback, View, type ViewStyle } from 'react-native'

interface Props {
  children: React.ReactNode
  style?: ViewStyle
  /** Si true, NO oculta al tocar (escape hatch para casos específicos). */
  disabled?: boolean
}

export function DismissKeyboardView({ children, style, disabled }: Props) {
  if (disabled) return <View style={style}>{children}</View>
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={style}>{children}</View>
    </TouchableWithoutFeedback>
  )
}
