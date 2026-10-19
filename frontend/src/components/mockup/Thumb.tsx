import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Image, ImageProps } from 'expo-image'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts } from '../../theme/typography'

type Props = {
  size?: number
  source?: ImageProps['source']
  initials?: string
  /** Defaults to 36% of size. */
  initialsSize?: number
  style?: StyleProp<ViewStyle>
}

export default function Thumb({ size = 56, source, initials, initialsSize, style }: Props) {
  const fontSize = initialsSize ?? Math.round(size * 0.36)
  return (
    <View style={[styles.thumb, { width: size, height: size }, style]}>
      {source ? (
        <Image source={source} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
      ) : initials ? (
        <Text style={[styles.initials, { fontSize, lineHeight: Math.round(fontSize * 1.15) }]} numberOfLines={1}>
          {initials}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: radius.thumb,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.tan,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.black,
    color: colors.ink,
  },
})
