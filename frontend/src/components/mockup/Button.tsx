import React from 'react'
import { ActivityIndicator, Insets, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import HardShadow from './HardShadow'

export type ButtonVariant = 'primary' | 'zoink' | 'secondary' | 'link'

type Props = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  leftIcon?: React.ReactNode
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

const MIN_TARGET = 48

type VariantSpec = {
  height: number
  box: ViewStyle
  text: TextStyle
  shadow: { offset: 'md' | 'lg'; color: string } | null
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  primary: {
    height: 56,
    box: { backgroundColor: colors.ink, borderWidth: border.thin, borderColor: colors.ink },
    text: { ...type.button, color: colors.green },
    shadow: { offset: 'md', color: colors.green },
  },
  zoink: {
    height: 72,
    box: { backgroundColor: colors.green, borderWidth: border.thick, borderColor: colors.ink },
    text: { fontFamily: fonts.black, fontSize: 26, letterSpacing: -1.2, lineHeight: 30, color: colors.ink },
    shadow: { offset: 'lg', color: colors.ink },
  },
  secondary: {
    height: 52,
    box: { backgroundColor: colors.surface, borderWidth: border.base, borderColor: colors.ink },
    text: { fontFamily: fonts.black, fontSize: 15, lineHeight: 19, color: colors.ink },
    shadow: null,
  },
  link: {
    height: 44,
    box: {},
    text: { ...type.label, color: colors.ink, textDecorationLine: 'underline' },
    shadow: null,
  },
}

function slopFor(height: number): Insets {
  const v = Math.max(0, Math.ceil((MIN_TARGET - height) / 2))
  return { top: v, bottom: v, left: 4, right: 4 }
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  leftIcon,
  accessibilityLabel,
  style,
}: Props) {
  const spec = VARIANTS[variant]
  const inactive = disabled || loading
  const isLink = variant === 'link'
  // Loading keeps the variant's look; only disabled switches to the tan state.
  const textColor = disabled ? colors.mutedAlt : (spec.text.color as string)

  const content = (
    <View
      style={[
        styles.box,
        isLink ? styles.linkBox : { height: spec.height },
        spec.box,
        disabled && !isLink ? styles.disabledBox : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {leftIcon}
          <Text style={[spec.text, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </View>
  )

  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? label,
    accessibilityState: { disabled: inactive, busy: loading },
  }

  if (spec.shadow) {
    return (
      <HardShadow
        {...a11y}
        // Disabled drops the shadow; loading keeps it but stops presses.
        pressable={!loading}
        onPress={loading ? undefined : onPress}
        disabled={disabled}
        offset={spec.shadow.offset}
        color={spec.shadow.color}
        radius={radius.pill}
        hitSlop={slopFor(spec.height)}
        style={style}
      >
        {content}
      </HardShadow>
    )
  }

  return (
    <Pressable
      {...a11y}
      onPress={onPress}
      disabled={inactive}
      hitSlop={slopFor(spec.height)}
      style={({ pressed }) => [pressed && !inactive ? styles.pressed : null, isLink ? styles.linkWrap : null, style]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
  },
  linkBox: {
    minHeight: 44,
    paddingHorizontal: 4,
  },
  linkWrap: {
    alignSelf: 'flex-start',
  },
  disabledBox: {
    backgroundColor: colors.tan,
  },
  pressed: {
    opacity: 0.7,
  },
})
