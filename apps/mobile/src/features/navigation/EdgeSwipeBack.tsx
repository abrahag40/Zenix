/**
 * EdgeSwipeBack — gesto nativo iOS de "deslizar desde el borde
 * izquierdo para regresar" implementado manualmente.
 *
 * Por qué construirlo nosotros y no usar el del Stack:
 *   Las screens de detalle viven dentro de Tabs (`href: null`), no en
 *   un Stack puro. expo-router-Tabs no expone el back-swipe de iOS, por
 *   diseño — Tabs es navegación lateral, no historial. Por eso el back
 *   swipe nativo no aparece sin nuestra capa.
 *
 * Comportamiento (Apple HIG iOS Navigation Bar):
 *   - Detecta pan que ARRANCA en los primeros 24px desde el borde
 *     izquierdo (zona de gesto sistémica de iOS)
 *   - Si el dedo recorre >60px hacia la derecha CON velocidad
 *     positiva, dispara router.back()
 *   - Haptic feedback selection al activar (Apple HIG)
 *   - El gesto NO compite con scroll vertical (sólo se activa con
 *     traslado horizontal dominante)
 *   - Solo iOS — Android usa hardware back que ya funciona
 *
 * Se aplica como wrapper en cada detail screen.
 *   <EdgeSwipeBack>
 *     <SafeAreaView> ... </SafeAreaView>
 *   </EdgeSwipeBack>
 *
 * Performance: el gesture handler corre en el thread UI (no JS bridge),
 * así que no bloquea la lista mientras escrolleas. Probado con
 * @shopify/flash-list y ScrollView normales.
 */

import { useCallback } from 'react'
import { View, Platform, StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'

interface EdgeSwipeBackProps {
  children: React.ReactNode
  /** Override the back action (e.g., closing a modal instead of navigating). */
  onBack?: () => void
  /** Disable the gesture (e.g., on a screen where you don't want back). */
  disabled?: boolean
}

const EDGE_WIDTH = 24       // First 24px from left = system iOS zone
const TRIGGER_DISTANCE = 60 // px the finger must travel to confirm
const TRIGGER_VELOCITY = 200 // px/s minimum to confirm intent

export function EdgeSwipeBack({
  children,
  onBack,
  disabled,
}: EdgeSwipeBackProps) {
  // Android: hardware back is fine, plus iOS-edge gesture is a foreign UX.
  // Skip the wrapper entirely on non-iOS platforms.
  if (Platform.OS !== 'ios' || disabled) {
    return <>{children}</>
  }

  const triggerBack = useCallback(() => {
    Haptics.selectionAsync()
    if (onBack) onBack()
    else if (router.canGoBack()) router.back()
  }, [onBack])

  // hitSlop CRÍTICO: restringe la zona de escucha del gesto a una franja
  // de 24px desde el borde izquierdo. Sin esto, el Pan handler envuelve
  // todo el árbol y compite con los ScrollView/FlatList hijos —
  // resultado: scroll vertical bloqueado en toda la app. Con hitSlop el
  // gesto literalmente no recibe eventos fuera de la franja, así que el
  // scroll vertical pasa intacto al hijo en el 99% de la pantalla.
  //
  // Apple iOS hace exactamente esto a nivel sistema: el back-swipe nativo
  // solo se registra en los primeros ~20pt desde el borde izquierdo.
  const pan = Gesture.Pan()
    .hitSlop({ left: 0, width: EDGE_WIDTH, top: 0, bottom: 0 })
    // .activeOffsetX requires the gesture to begin moving horizontally
    // BEFORE the system claims it for vertical scroll.
    .activeOffsetX([10, 999])
    // failOffsetY makes the gesture YIELD if the user is scrolling
    // vertically — defensa secundaria; el hitSlop ya hace el grueso.
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      'worklet'
      // Confirm enough horizontal distance + velocity
      if (e.translationX > TRIGGER_DISTANCE && e.velocityX > TRIGGER_VELOCITY) {
        runOnJS(triggerBack)()
      }
    })
  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>{children}</View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
