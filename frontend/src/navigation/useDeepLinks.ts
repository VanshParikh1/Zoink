import { useEffect } from 'react'
import { Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { parseDeepLink, routeDeepLink, targetForNotification } from './deepLinks'
import { QA_TOOLS, simulateOffline } from '../services/network'
import { armCrash } from '../services/qaCrash'

/**
 * Listens for links (zoink://…) and notification taps for the whole life of
 * the app, cold start included, and hands each to deepLinks.ts, which opens
 * it now or holds it until the signed-in app is up. Mounted once, outside the
 * signed-in/signed-out switch, so nothing that arrives while signed out is
 * lost.
 */
export function useDeepLinkSources() {
  useEffect(() => {
    const seenTaps = new Set<string>()

    function fromUrl(url: string | null) {
      if (!url) return
      const target = parseDeepLink(url, { qa: QA_TOOLS })
      if (!target) return
      if ('qa' in target) {
        if (target.qa === 'offline') simulateOffline(target.mode)
        else armCrash(target.level)
        return
      }
      routeDeepLink(target)
    }

    function fromTap(response: Notifications.NotificationResponse | null) {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
      // The tap that launched the app is reported both ways; open it once.
      const id = response.notification.request.identifier
      if (seenTaps.has(id)) return
      seenTaps.add(id)
      const target = targetForNotification(response.notification.request.content.data)
      if (target) routeDeepLink(target)
    }

    Linking.getInitialURL().then(fromUrl).catch(() => {})
    const urlSubscription = Linking.addEventListener('url', ({ url }) => fromUrl(url))

    try {
      fromTap(Notifications.getLastNotificationResponse())
      // So a later launch from the app icon doesn't reopen the same place.
      Notifications.clearLastNotificationResponse()
    } catch {
      // Not available (web): taps still arrive through the listener.
    }
    const tapSubscription = Notifications.addNotificationResponseReceivedListener(fromTap)

    return () => {
      urlSubscription.remove()
      tapSubscription.remove()
    }
  }, [])
}
