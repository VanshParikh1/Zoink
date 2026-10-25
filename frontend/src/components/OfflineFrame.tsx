import React, { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { useIsOffline } from '../services/network'
import { toast } from '../services/toast'

/** Room the bar takes below the status bar; ToastHost sits under it. */
export const OFFLINE_BAR_HEIGHT = 48

/**
 * While the device is offline, a bar across the top of every screen. It takes
 * the status bar's space itself and tells the screens below there's no top
 * inset left, so nothing is covered.
 */
export default function OfflineFrame({ children }: { children: React.ReactNode }) {
  const offline = useIsOffline()
  const insets = useSafeAreaInsets()
  const screenInsets = useMemo(() => (offline ? { ...insets, top: 0 } : insets), [offline, insets])

  const wasOffline = useRef(offline)
  useEffect(() => {
    if (wasOffline.current && !offline) toast.info("You're back online.")
    wasOffline.current = offline
  }, [offline])

  return (
    <View style={styles.frame}>
      {offline ? (
        <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + OFFLINE_BAR_HEIGHT }]}>
          <Feather name="wifi-off" size={16} color={colors.ink} />
          <Text style={styles.text} numberOfLines={2}>
            You're offline. Nothing will send until you reconnect.
          </Text>
        </View>
      ) : null}
      <SafeAreaInsetsContext.Provider value={screenInsets}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.screen,
    backgroundColor: colors.warning,
  },
  text: {
    ...type.labelSm,
    color: colors.ink,
    flex: 1,
  },
})
