import React from 'react'
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius as radii, space } from '../../theme/tokens'

/** One placeholder shape in the app's loading tan. */
export function SkeletonBlock({
  width = '100%',
  height,
  radius = radii.thumbSm,
  style,
}: {
  width?: DimensionValue
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.block, { width, height, borderRadius: radius }, style]} />
}

/** A flat card outline holding placeholder lines, like the cards it stands in for. */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} height={i === 0 ? 18 : 12} width={i === 0 ? '60%' : i % 2 ? '90%' : '75%'} radius={6} />
      ))}
    </View>
  )
}

/**
 * Placeholder for a detail screen while it loads: an optional photo area,
 * a title, then cards. Hidden from screen readers (the screen's header names
 * what's loading).
 */
export function DetailSkeleton({ hero = false, cards = 3 }: { hero?: boolean; cards?: number }) {
  return (
    <View style={styles.detail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {hero ? <SkeletonBlock height={220} radius={radii.hero} /> : null}
      <SkeletonBlock height={28} width="70%" radius={8} />
      <SkeletonBlock height={14} width="45%" radius={6} />
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} lines={i === 0 ? 2 : 3} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.tan,
  },
  card: {
    gap: space.md,
    padding: space.xxl,
    borderRadius: radii.card,
    borderWidth: border.base,
    borderColor: colors.tan,
    backgroundColor: colors.surface,
  },
  detail: {
    gap: space.xxl,
  },
})
