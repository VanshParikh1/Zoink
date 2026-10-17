import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Wordmark from '../../../assets/ZoinkWordmark.svg'
import { colors } from '../../theme/colors'
import { radius } from '../../theme/tokens'
import HardShadow from './HardShadow'

// The wordmark's art sits inside a near-square 2048x2024 canvas; this is the
// tight bounding box of its paths, so the logo fills the pill instead of
// shrinking to a sliver in the middle of the padding.
const WORDMARK_VIEWBOX = '57 756 1952 508'
const WORDMARK_ASPECT = 1952 / 508

const SIZES = {
  sm: { height: 38, logoHeight: 18 },
  md: { height: 40, logoHeight: 20 },
  lg: { height: 44, logoHeight: 22 },
} as const

type Props = {
  size?: keyof typeof SIZES
  style?: StyleProp<ViewStyle>
}

export default function LogoPill({ size = 'md', style }: Props) {
  const s = SIZES[size]
  return (
    <HardShadow offset="sm" color={colors.green} radius={radius.pill} style={[styles.wrap, style]}>
      <View
        style={[styles.pill, { height: s.height, paddingHorizontal: s.height * 0.4 }]}
        accessibilityRole="image"
        accessibilityLabel="Zoink"
      >
        <Wordmark
          width={Math.round(s.logoHeight * WORDMARK_ASPECT)}
          height={s.logoHeight}
          viewBox={WORDMARK_VIEWBOX}
        />
      </View>
    </HardShadow>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  pill: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
