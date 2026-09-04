import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import LogoMark from '../../assets/logo.svg'

type ZoinkLogoProps = {
  size?: number
  style?: ViewStyle
}

export default function ZoinkLogo({ size = 80, style }: ZoinkLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <LogoMark width={size} height={size} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
