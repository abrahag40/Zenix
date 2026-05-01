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

// Notification handler — Expo SDK 54 changed the shape (shouldShowAlert deprecated).
// shouldShowBanner = floating banner (top of screen, iOS Notification Center style).
// shouldShowList = persists in OS notification list (Android tray, iOS lock screen).
// Both default to the legacy shouldShowAlert behavior. Apple HIG recommends both
// for tasks the user must act on quickly (housekeeper roster).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Device.isDevice) return

  // Skip push token registration in Expo Go — it requires an EAS projectId
  // which only standalone builds carry. Without this guard, the call
  // throws "No projectId found" and the unhandled rejection breaks the
  // auth flow on the very first login.
  if (IS_EXPO_GO && !EAS_PROJECT_ID) {
    if (__DEV__) {
      console.log('[push] Skipping registration in Expo Go (no EAS projectId).')
    }
    return
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

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
