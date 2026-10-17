import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius as radii, shadow as shadows, space } from '../../theme/tokens'
import HardShadow from './HardShadow'

type Props = {
  children: React.ReactNode
  radius?: 'card' | 'cardLg'
  /** Shadow offset token, or false for none. */
  shadow?: keyof typeof shadows | false
  padding?: number
  /** Degrees; tilts the card together with its shadow. */
  rotate?: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

export default function Card({ children, radius = 'card', shadow = 'md', padding = space.xxl, rotate, style, contentStyle }: Props) {
  const r = radii[radius]
  const body = <View style={[styles.card, { borderRadius: r, padding }, contentStyle]}>{children}</View>
  if (shadow === false) return <View style={[rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>{body}</View>
  return (
    <HardShadow offset={shadow} radius={r} rotate={rotate} style={style}>
      {body}
    </HardShadow>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.base,
    borderColor: colors.ink,
  },
})
