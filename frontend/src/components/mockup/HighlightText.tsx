import React, { useState } from 'react'
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { type } from '../../theme/typography'

type Props = {
  children: string
  style?: StyleProp<TextStyle>
  bandColor?: string
  containerStyle?: StyleProp<ViewStyle>
}

const BAND_TOP = 0.62
const BAND_BOTTOM = 0.92

/**
 * Text with a marker band behind its lower part (62%–92% of the line box).
 * SINGLE-LINE ONLY: the band is one rectangle sized from the Text's onLayout,
 * so wrapped text would get one band across the whole block. The Text is
 * forced to numberOfLines={1}.
 */
export default function HighlightText({ children, style, bandColor = colors.green, containerStyle }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (!size || size.width !== width || size.height !== height) setSize({ width, height })
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      {size ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            width: size.width,
            top: size.height * BAND_TOP,
            height: size.height * (BAND_BOTTOM - BAND_TOP),
            backgroundColor: bandColor,
          }}
        />
      ) : null}
      <Text style={[styles.text, style]} numberOfLines={1} onLayout={handleLayout}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  text: {
    ...type.h1,
    color: colors.ink,
  },
})
