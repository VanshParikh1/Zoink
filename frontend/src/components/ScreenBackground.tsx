import React from 'react'
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../theme/colors'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Controls how prominent the top blob is. 0 = hidden, 1 = full. Default 1. */
  blobIntensity?: number
}

/**
 * Full-screen background with a dark gradient and two soft green blobs
 * inspired by the Cash App aesthetic. Wrap any screen's root in this instead
 * of a plain LinearGradient.
 */
export default function ScreenBackground({ children, style, blobIntensity = 1 }: Props) {
  const topOpacity = 0.28 * blobIntensity
  const bottomOpacity = 0.12 * blobIntensity

  return (
    <LinearGradient colors={theme.backgroundGradient} style={[styles.root, style]}>
      {/* Top-right large blob */}
      <View
        pointerEvents="none"
        style={[
          styles.blobTopRight,
          { opacity: topOpacity },
        ]}
      />
      {/* Bottom-left softer blob */}
      <View
        pointerEvents="none"
        style={[
          styles.blobBottomLeft,
          { opacity: bottomOpacity },
        ]}
      />
      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  /** Large organic circle — upper right */
  blobTopRight: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: theme.primary, // limeGreen
    top: -80,
    right: -100,
  },
  /** Smaller soft circle — lower left */
  blobBottomLeft: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: theme.primary,
    bottom: 80,
    left: -120,
  },
})
