import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

// Every haptic in the app goes through here, so all of them follow the
// phone's own setting. On iOS the feedback generators do nothing when System
// Haptics is off. On Android, expo-haptics' impact and notification calls
// drive the Vibrator, which ignores the "Touch feedback" setting, so Android
// uses performAndroidHapticsAsync, which follows it.
//
// Kept for moments that matter: a booking request sent, a request accepted
// or declined, a message sent, a pull-to-refresh, a handoff confirmed, and
// moving between screens and tabs. Not for every tap.

const android = Platform.OS === 'android'

function quiet(promise: Promise<void>) {
  promise.catch(() => {})
}

export const haptics = {
  /** A light tick: navigation, tabs, pull-to-refresh. */
  tap() {
    quiet(android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
  },
  /** A firmer press: starting something (list an item, start a handoff). */
  press() {
    quiet(android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
  },
  /** Something the person asked for went through. */
  success() {
    quiet(android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
  },
  /** It didn't. */
  error() {
    quiet(android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
  },
}
