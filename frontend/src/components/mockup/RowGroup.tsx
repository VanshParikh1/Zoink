import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import Card from './Card'

const DIVIDER = 1.5

type GroupProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

/** Flat card of settings-style rows with a 1.5 divider between them. */
export function RowGroup({ children, style }: GroupProps) {
  const rows = React.Children.toArray(children).filter(Boolean)
  return (
    // Clipped so a pressed row's fill follows the card's corners.
    <Card shadow={false} padding={0} style={style} contentStyle={styles.clip}>
      {rows.map((row, index) => (
        <View key={index} style={index > 0 ? styles.divided : null}>
          {row}
        </View>
      ))}
    </Card>
  )
}

type RowProps = {
  label: string
  icon?: React.ComponentProps<typeof Feather>['name']
  /** Custom leading element (e.g. an avatar) instead of an icon. */
  leading?: React.ReactNode
  /** Caption under the label. */
  value?: string | null
  onPress?: () => void
  /** Replaces the chevron (a Switch, a link, a value). */
  right?: React.ReactNode
  danger?: boolean
  loading?: boolean
  accessibilityLabel?: string
}

/** Icon, bold label, optional caption, and a chevron when it's tappable. */
export function ListRow({ label, icon, leading, value, onPress, right, danger = false, loading = false, accessibilityLabel }: RowProps) {
  const tint = danger ? colors.danger : colors.ink
  const content = (
    <>
      {leading ?? (icon ? <Feather name={icon} size={20} color={tint} /> : null)}
      <View style={styles.text}>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : right !== undefined ? (
        right
      ) : onPress ? (
        <Feather name="chevron-right" size={20} color={colors.mutedAlt} />
      ) : null}
    </>
  )

  if (!onPress) return <View style={styles.row}>{content}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  )
}

/** Small mono heading above a RowGroup. */
export function GroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  divided: {
    borderTopWidth: DIVIDER,
    borderTopColor: colors.divider,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.xxl,
    paddingVertical: space.lg,
  },
  pressed: {
    backgroundColor: colors.bg,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...type.bodySm,
    fontFamily: fonts.bold,
  },
  value: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  groupLabel: {
    ...type.eyebrow,
    color: colors.mutedAlt,
    marginTop: space.lg,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
})
