import React from 'react'
import { View, StyleSheet, Dimensions, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { theme } from '../theme/colors'

const { width: W, height: H } = Dimensions.get('window')

interface Props {
  children: React.ReactNode
  style?: any
}

/**
 * ScreenBackground – Blurred blob backdrop.
 * Three organic circles at balanced positions, blurred into soft ambient glows.
 */
export default function ScreenBackground({ children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      {/* Colored circles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.blob, styles.blobA]} />
      </View>

      {/* Blur layer */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 25}
        tint="light"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {children}
    </View>
  )
}

const BLOB_SIZE_A = 260

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.screen,
    overflow: 'hidden',
  },

  blob: {
    position: 'absolute',
    borderRadius: 999,
  },

  // ● Top-right — brand green highlight
  blobA: {
    width: BLOB_SIZE_A,
    height: BLOB_SIZE_A,
    backgroundColor: 'rgba(109, 216, 50, 0.28)', // logo green tint
    top: 40,
    right: -50,
  },
})
