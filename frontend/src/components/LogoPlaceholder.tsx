import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import ZoinkLogo from './ZoinkLogo'
import { theme } from '../theme/colors'

type LogoPlaceholderProps = {
  size?: 'small' | 'medium' | 'large'
  label?: string
  style?: ViewStyle
}

const SIZE_MAP = {
  small: 40,
  medium: 88,
  large: 116,
}

export default function LogoPlaceholder({
  size = 'medium',
  label = 'zoink',
  style,
}: LogoPlaceholderProps) {
  return (
    <View style={[styles.base, style]}>
      <ZoinkLogo size={SIZE_MAP[size]} />
      {size === 'large' && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
})
