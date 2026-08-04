import React from 'react'
import { View, ViewStyle, StyleProp } from 'react-native'
import { theme } from '../theme/colors'

type Props = {
  children: React.ReactNode
  radius?: number
  offset?: number
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

/**
 * Shared neobrutalist "block shadow" primitive: an ink-colored backing plate
 * peeking out from behind a bordered foreground panel. RN's native shadow /
 * elevation always renders soft and blurred (especially on Android), so a
 * crisp offset shadow needs two stacked views instead of shadow props.
 */
export default function HardBlock({
  children,
  radius = theme.radius.sm,
  offset = theme.hard.offset.md,
  backgroundColor = theme.cardBackground,
  borderColor = theme.hard.ink,
  borderWidth = theme.hard.border,
  style,
  contentStyle,
}: Props) {
  return (
    <View style={[{ backgroundColor: theme.hard.ink, borderRadius: radius }, style]}>
      <View
        style={[
          {
            backgroundColor,
            borderRadius: radius,
            borderWidth,
            borderColor,
            marginRight: offset,
            marginBottom: offset,
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  )
}
