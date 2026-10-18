import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { releaseMyPushToken, updateMyPushToken } from './usersApi'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  )
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  const projectId = getProjectId()
  const token = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync()

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  return token.data
}

export async function syncPushToken() {
  const token = await registerForPushNotificationsAsync()
  if (!token) {
    return null
  }

  await updateMyPushToken(token)
  return token
}

// This phone's push token, without asking for permission: null when
// notifications were never allowed, in which case none was ever registered.
async function currentDevicePushToken() {
  if (Platform.OS === 'web') return null
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') return null

  const projectId = getProjectId()
  const token = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync()
  return token.data
}

// Signing out on this phone: take its push token off the account, so the next
// person to use the phone doesn't get this account's notifications. Takes the
// session token explicitly so it can run after the session is cleared locally
// (or has already ended on the server). Never throws; signing in on this phone
// claims the token back from any account that still has it.
export async function releasePushToken(sessionToken: string) {
  try {
    const expoPushToken = await currentDevicePushToken()
    if (expoPushToken) {
      await releaseMyPushToken(expoPushToken, sessionToken)
    }
  } catch (error) {
    console.warn('Failed to release push token', error)
  }
}
