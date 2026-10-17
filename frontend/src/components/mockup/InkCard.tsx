import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { radius } from '../../theme/tokens'
import { type } from '../../theme/typography'
import HardShadow from './HardShadow'

type Props = {
  /** Rendered in onInk. RN text doesn't inherit color, so children that render
   *  their own Text should use `colors.onInk` / `colors.onInkMuted`. */
  title?: string
  body?: string
  children?: React.ReactNode
  rotate?: number
  style?: StyleProp<ViewStyle>
}

export default function InkCard({ title, body, children, rotate, style }: Props) {
  return (
    <HardShadow offset="lg" color={colors.green} radius={radius.hero} rotate={rotate} style={style}>
      <View style={styles.card}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {children}
      </View>
    </HardShadow>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ink,
    borderRadius: radius.hero,
    padding: 16,
    gap: 10,
  },
  title: {
    ...type.section,
    color: colors.onInk,
  },
  body: {
    ...type.bodySm,
    color: colors.onInkMuted,
  },
})
