import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts } from '../../theme/typography'

export type BadgeVariant = 'lime' | 'green' | 'surface' | 'inkGreen'

type Props = {
  label: string
  variant?: BadgeVariant
  icon?: React.ReactNode
  size?: 12 | 13
  style?: StyleProp<ViewStyle>
}

const VARIANTS: Record<BadgeVariant, { bg: string; fg: string; bordered: boolean }> = {
  lime: { bg: colors.lime, fg: colors.ink, bordered: true },
  green: { bg: colors.green, fg: colors.ink, bordered: true },
  surface: { bg: colors.surface, fg: colors.ink, bordered: true },
  inkGreen: { bg: colors.ink, fg: colors.green, bordered: false },
}

export default function Badge({ label, variant = 'lime', icon, size = 12, style }: Props) {
  const v = VARIANTS[variant]
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: v.bg },
        // Without a border the ink badge keeps the same outer size as the others.
        v.bordered ? styles.bordered : styles.borderless,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.text, { color: v.fg, fontSize: size, lineHeight: size + 4 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  bordered: {
    borderWidth: border.thin,
    borderColor: colors.ink,
  },
  borderless: {
    paddingHorizontal: 10 + border.thin,
    paddingVertical: 3 + border.thin,
  },
  text: {
    fontFamily: fonts.bold,
  },
})
