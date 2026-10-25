import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { type } from '../theme/typography'
import HardShadow from './mockup/HardShadow'
import { currentToast, subscribeToasts, Toast, toast as toasts, toastDuration } from '../services/toast'
import { useIsOffline } from '../services/network'
import { OFFLINE_BAR_HEIGHT } from './OfflineFrame'

const ICONS: Record<Toast['kind'], keyof typeof Feather.glyphMap> = {
  success: 'check',
  error: 'alert-circle',
  info: 'info',
}

/**
 * Shows services/toast.ts's current toast below the status bar. Mounted once
 * at the root. On iOS it sits in its own window so it shows over modals too;
 * only the toast itself takes touches (tap to dismiss).
 */
export default function ToastHost() {
  const insets = useSafeAreaInsets()
  const offline = useIsOffline()
  const [shown, setShown] = useState<Toast | null>(currentToast)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => subscribeToasts((next) => {
    if (next) {
      setShown(next)
      progress.setValue(0)
      Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    } else {
      Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(null)
      })
    }
  }), [progress])

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => toasts.dismiss(shown.id), toastDuration(shown))
    return () => clearTimeout(timer)
  }, [shown])

  if (!shown) return null

  const body = (
    <Animated.View
      style={[
        styles.wrap,
        { top: insets.top + (offline ? OFFLINE_BAR_HEIGHT : 0) + space.sm },
        { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
      ]}
    >
      <Pressable onPress={() => toasts.dismiss(shown.id)} accessibilityRole="alert" accessibilityHint="Dismisses this message">
        <HardShadow offset="sm" radius={radius.card} color={shown.kind === 'error' ? colors.danger : colors.ink}>
          <View style={[styles.toast, shown.kind === 'error' ? styles.toastError : null]}>
            <View style={[styles.icon, shown.kind === 'error' ? styles.iconError : null]}>
              <Feather name={ICONS[shown.kind]} size={16} color={shown.kind === 'error' ? colors.onInk : colors.ink} />
            </View>
            <Text style={styles.message}>{shown.message}</Text>
          </View>
        </HardShadow>
      </Pressable>
    </Animated.View>
  )

  return Platform.OS === 'ios' ? <FullWindowOverlay>{body}</FullWindowOverlay> : body
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.screen,
    right: space.screen,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.xxl,
    borderRadius: radius.card,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  toastError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  iconError: {
    backgroundColor: colors.danger,
  },
  message: {
    ...type.label,
    color: colors.ink,
    flex: 1,
  },
})
