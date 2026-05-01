import React from 'react'
import { View, StyleSheet, StyleProp, ViewStyle, Dimensions, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { theme } from '../theme/colors'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

/**
 * ScreenBackground – Liquid Glass Light Edition.
 * Features a bright white/gray gradient with vibrant lime green blobs
 * to create a luminous backdrop for frosted glass layers.
 */
export default function ScreenBackground({ children, style }: Props) {
  return (
    <LinearGradient colors={theme.backgroundGradient} style={[styles.root, style]}>
      {/* Blob 1: Vibrant Top-Left (Lime) */}
      <View
        pointerEvents="none"
        style={styles.blob1}
      />

      {/* Blob 3: Center Anchor (Green Glow) */}
      <View
        pointerEvents="none"
        style={styles.blob3}
      />

      {/* Blob 2: Bottom-Right (Emerald) */}
      <View
        pointerEvents="none"
        style={styles.blob2}
      />

      {/* Tactile noise overlay */}
      <View 
        pointerEvents="none" 
        style={styles.noiseOverlay} 
      />

      {/* Blur the blobs to create a soft luminous glow */}
      {Platform.OS === 'ios' ? (
        <BlurView 
          intensity={80} 
          tint="dark" 
          style={StyleSheet.absoluteFillObject} 
          pointerEvents="none"
        />
      ) : null}

      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: theme.colors.inkBase,
  },
  blob1: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.6,
    height: SCREEN_WIDTH * 1.6,
    borderRadius: (SCREEN_WIDTH * 1.6) / 2,
    backgroundColor: theme.blobColor1,
    top: -SCREEN_WIDTH * 0.6,
    left: -SCREEN_WIDTH * 0.5,
  },
  blob2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.4,
    height: SCREEN_WIDTH * 1.4,
    borderRadius: (SCREEN_WIDTH * 1.4) / 2,
    backgroundColor: theme.blobColor2,
    bottom: -SCREEN_WIDTH * 0.4,
    right: -SCREEN_WIDTH * 0.5,
  },
  blob3: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    borderRadius: (SCREEN_WIDTH * 1.2) / 2,
    backgroundColor: theme.blobColor3,
    bottom: -SCREEN_WIDTH * 0.2,
    left: -SCREEN_WIDTH * 0.1,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.02)', // subtle noise overlay
  },
})
