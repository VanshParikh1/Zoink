import React from 'react'
import { Image, View, StyleSheet, ViewStyle, ImageStyle } from 'react-native'

type ZoinkFullLogoProps = {
  width?: number
  height?: number
  style?: ViewStyle
}

export default function ZoinkFullLogo({ width = 200, height = 60, style }: ZoinkFullLogoProps) {
  return (
    <View style={[styles.container, { width, height }, style]}>
      <Image
        source={require('../../assets/ZoinkTransparent.png')}
        style={[styles.logo, { width, height }]}
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
    // No specific styles needed for the image itself if container handles it
  },
})
