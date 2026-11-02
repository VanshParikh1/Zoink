import React from 'react'
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border } from '../../theme/tokens'

const SIZE = 44
// 44 + 2 + 2 = 48dp touch target
const SLOP = { top: 2, bottom: 2, left: 2, right: 2 }

type Props = {
  children: React.ReactNode
  onPress: () => void
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export default function IconButton({ children, onPress, accessibilityLabel, disabled = false, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={SLOP}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: border.base,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.tan,
  },
  disabled: {
    opacity: 0.5,
  },
})
