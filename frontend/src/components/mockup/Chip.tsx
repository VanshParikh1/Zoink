import React from 'react'
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts } from '../../theme/typography'
import HardShadow from './HardShadow'

const HEIGHT = 38
// 38 + 5 + 5 = 48dp touch target
const SLOP = { top: 5, bottom: 5, left: 2, right: 2 }

type Props = {
  label: string
  active?: boolean
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

export default function Chip({ label, active = false, onPress, style }: Props) {
  const body = (
    <View style={[styles.chip, active ? styles.active : styles.inactive]}>
      <Text style={[styles.text, active ? styles.activeText : styles.inactiveText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={SLOP}
      style={style}
    >
      {active ? (
        <HardShadow offset="xs" radius={radius.pill}>
          {body}
        </HardShadow>
      ) : (
        body
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    height: HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.ink,
  },
  active: {
    backgroundColor: colors.green,
    borderWidth: border.base,
  },
  inactive: {
    backgroundColor: colors.surface,
    borderWidth: border.thin,
  },
  text: {
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  activeText: {
    fontFamily: fonts.black,
  },
  inactiveText: {
    fontFamily: fonts.bold,
  },
})
