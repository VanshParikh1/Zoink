import React from 'react'
import { Image, View, StyleSheet, ViewStyle, ImageStyle } from 'react-native'

type ZoinkLogoProps = {
  size?: number
  style?: ViewStyle
}

export default function ZoinkLogo({ size = 80, style }: ZoinkLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={require('../../assets/logo.png')}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="contain"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderRadius: 16,
  },
})
