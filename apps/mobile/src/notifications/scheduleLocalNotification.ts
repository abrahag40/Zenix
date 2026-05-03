/**
 * scheduleLocalNotification — OS-only notification utility.
 *
 * Usable by any module that needs an OS banner without the full-screen
 * alarm overlay (e.g. a soft reminder, a background sync result, …).
 *
 * For alarms (full-screen overlay + OS banner on lock screen) use
 * alarmService.show() instead — AlarmHost handles the OS notification
 * automatically for that case.
 */

import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import type { LocalNotificationInput } from './types'

export async function scheduleLocalNotification(
  input: LocalNotificationInput,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      sound: true,
      data: input.data ?? {},
      ...(Platform.OS === 'android' && input.channelId
        ? { channelId: input.channelId }
        : {}),
    },
    trigger: null, // fire immediately
  })
}

export async function dismissAllLocalNotifications(): Promise<void> {
  return Notifications.dismissAllNotificationsAsync()
}
