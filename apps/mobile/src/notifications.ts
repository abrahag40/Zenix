import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { api } from './api/client'

/**
 * In Expo Go (the public dev client used for QR-scan testing), push tokens
 * cannot be generated for the project — Expo's hosted push service requires
 * an EAS projectId, which only standalone builds (eas build) carry.
 *
 * Behavior we want:
 *   - Expo Go             → skip silently. Local notifications still work.
 *                           User can test all UI without push interruptions.
 *   - Standalone dev      → register with EAS projectId from app.json.extra.
 *   - Production          → register normally.
 *
 * This guard prevents the "No projectId found" error from leaking out and
 * breaking auth flow during demos.
 */
const IS_EXPO_GO = Constants.appOwnership === 'expo'
// EAS projectId — leído en este orden (priorizado para flexibilidad dev/prod):
//  1. Env var EXPO_PUBLIC_EAS_PROJECT_ID (override por sesión, útil para testing)
//  2. app.json extra.eas.projectId (canonical — populated by `eas init`)
// Setup steps (cuando contrates Apple Developer + cuenta Expo):
//   $ npm i -g eas-cli && eas login
//   $ cd apps/mobile && eas init    → escribe el projectId en app.json
//   $ eas build:configure
//   $ eas build --profile development --platform ios   (development build)
const ENV_PROJECT_ID = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '').trim()
const CONFIG_PROJECT_ID = ((Constants.expoConfig?.extra?.eas?.projectId as string | undefined) || '').trim()
const EAS_PROJECT_ID = ENV_PROJECT_ID || CONFIG_PROJECT_ID || undefined

// Notification handler — controls presentation while the app is in the FOREGROUND.
// When the phone is locked the OS ignores this handler entirely and always shows
// the notification — so shouldShowList:true is enough to guarantee lock-screen delivery.
//
// task:ready alarms: suppress the foreground banner so it doesn't overlay the
// in-app alarm screen and block the slide-to-dismiss gesture. The in-app overlay
// handles everything when the app is active. shouldShowList:true keeps the
// notification in the tray so the user sees it if they pull down the shade.
//
// All other notifications: show banner normally (Apple HIG — urgent tasks).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isAlarm = notification.request.content.data?.alarm === true
    const showBanner = !isAlarm
    return {
      shouldShowBanner: showBanner,
      shouldShowList: true,
      shouldPlaySound: showBanner,
      shouldSetBadge: true,
    }
  },
})

/**
 * Request notification permissions and configure Android channels.
 *
 * This is intentionally separate from push-token registration:
 *   - Works in Expo Go (no EAS projectId needed for local notifications)
 *   - Must be called before scheduling any local alarm notifications
 *   - Safe to call multiple times (getPermissionsAsync guards double-prompt)
 *
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return false

    if (Platform.OS === 'android') {
      // Default channel — general notifications
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notificaciones',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
      // Canal alarma — task:ready URGENT con overlay tipo SO.
      // Comportamiento como alarma del despertador:
      //   - importance MAX → heads-up notification (overlay sobre cualquier app)
      //   - bypassDnd:true → suena incluso en No molestar
      //   - lockscreenVisibility PUBLIC → visible en pantalla bloqueada
      //   - lightColor + showBadge → señales adicionales
      //   - vibrationPattern aggressive → 500ms on/off, 5 ciclos
      //
      // En Android 11+ con USE_FULL_SCREEN_INTENT permission (declarada en
      // app.json), el SO lanza la activity full-screen incluso con pantalla
      // bloqueada. AlarmOverlay.tsx ocupa toda la pantalla = comportamiento
      // alarma despertador.
      //
      // Nota iOS: Apple requiere "Critical Alerts" entitlement (apply via
      // developer.apple.com/contact) para bypass DnD + sonido en silent mode.
      // Sin él, las notificaciones siguen las reglas estándar (silent → mute).
      // Con EAS build + entitlement aprobado, Expo soporta payload
      // `interruption-level: 'critical'` automáticamente.
      await Notifications.setNotificationChannelAsync('task-alarm', {
        name: 'Alarma de tarea',
        description: 'Notificación urgente cuando una habitación está lista para limpiar',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 300, 500, 300, 500, 300, 500],
        enableVibrate: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        lightColor: '#EF4444',
        showBadge: true,
        sound: 'default',
      })
    }

    return true
  } catch (err) {
    if (__DEV__) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[notifications] Permission request failed:', msg)
    }
    return false
  }
}

export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Device.isDevice) return

  // Skip push token registration in Expo Go — it requires an EAS projectId
  // which only standalone builds carry. Without this guard, the call
  // throws "No projectId found" and the unhandled rejection breaks the
  // auth flow on the very first login.
  // Note: local alarm notifications still work in Expo Go via
  // requestNotificationPermissions() above.
  if (IS_EXPO_GO && !EAS_PROJECT_ID) {
    if (__DEV__) {
      console.log('[push] Skipping push registration in Expo Go (no EAS projectId).')
    }
    return
  }

  try {
    // Permissions and channels are handled by requestNotificationPermissions().
    // Verify grant before attempting token fetch.
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return

    // Pass projectId explicitly — required in SDK 54+ (per Expo docs).
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
    )
    const token = tokenResponse.data
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'

    await api.post('/notifications/token', { token, platform })
  } catch (err) {
    // Defensive: any failure here MUST NOT bubble up. Push registration is
    // a side-effect of login, not a precondition. Auth must keep working
    // even if push setup fails (network glitch, missing projectId, etc.).
    if (__DEV__) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[push] Registration failed:', msg)
    }
  }
}

/**
 * Payload deep-link de cualquier notificación push del sistema Zenix.
 * Cada notif puede transportar SOLO uno de estos identificadores (el más
 * específico). Si llegan varios, prioridad: ticketId > taskId > stayId.
 * El consumer decide a qué screen navegar.
 *
 * Sprint M3.2 — agregado ticketId para soportar push de mantenimiento.
 */
export interface NotificationDeepLink {
  taskId?: string       // CleaningTask housekeeping
  ticketId?: string     // MaintenanceTicket (Sprint M3.2)
  stayId?: string       // Reserva PMS (futuro)
}

/** Listen for notification taps and return cleanup function */
export function setupNotificationListeners(
  onNotificationResponse: (data: NotificationDeepLink) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationDeepLink
    onNotificationResponse(data)
  })
  return () => sub.remove()
}
