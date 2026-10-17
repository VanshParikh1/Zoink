import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../theme/colors'
import { border } from '../../theme/tokens'

type Props = {
  /** Diameter of the approximate-area circle. */
  size: number
}

/** Centered area marker over the map tiles: translucent green fill, ink ring. */
export default function MapPin({ size }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2, marginTop: -size / 2, marginLeft: -size / 2 }
  return (
    <View style={[styles.pin, box]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, styles.fill, { borderRadius: size / 2 }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderWidth: border.base,
    borderColor: colors.ink,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.green,
    opacity: 0.35,
  },
})
