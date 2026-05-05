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
const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId as string | undefined

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
      // High-priority alarm channel for task:ready events.
      // bypassDnd: true ensures the alarm rings even in Do Not Disturb mode
      // (same behavior as alarm clock apps — critical for housekeeping ops).
      await Notifications.setNotificationChannelAsync('task-alarm', {
        name: 'Alarma de tarea',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 300, 500, 300, 500],
        enableVibrate: true,
        bypassDnd: true,
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

/** Listen for notification taps and return cleanup function */
export function setupNotificationListeners(
  onNotificationResponse: (data: { taskId?: string }) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { taskId?: string }
    onNotificationResponse(data)
  })
  return () => sub.remove()
}
