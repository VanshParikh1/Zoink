import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { theme } from '../theme/colors'

type LogoPlaceholderProps = {
  size?: 'small' | 'medium' | 'large'
  label?: string
  style?: ViewStyle
}

export default function LogoPlaceholder({
  size = 'medium',
  label = 'zoink',
  style,
}: LogoPlaceholderProps) {
  return (
    <View style={[styles.base, styles[size], style]}>
      <Text style={[styles.mark, size === 'small' && styles.smallMark]}>Z</Text>
      {size !== 'small' && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.primary,
    borderColor: theme.text,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  medium: {
    width: 88,
    height: 88,
    borderRadius: 26,
  },
  large: {
    width: 116,
    height: 116,
    borderRadius: 34,
  },
  mark: {
    color: theme.colors.inkBase,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  smallMark: {
    fontSize: 20,
    lineHeight: 24,
  },
  label: {
    color: theme.colors.inkBase,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
})
