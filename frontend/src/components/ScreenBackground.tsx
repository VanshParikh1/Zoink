import React from 'react'
// 1. Added TouchableOpacity and Text imports
import { View, StyleSheet, Dimensions, Platform, TouchableOpacity, Text } from 'react-native'
import { BlurView } from 'expo-blur'
import { theme } from '../theme/colors'
import { useAuth } from '../context/AuthContext'

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
  const { logout } = useAuth()

  return (
    <View style={[styles.container, style]}>
      {/* Colored circles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.blob, styles.blobA]} />
        <View style={[styles.blob, styles.blobB]} />
        <View style={[styles.blob, styles.blobC]} />
      </View>

      {/* Blur layer */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 25}
        tint="light"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {children}

      {__DEV__ && (
        <TouchableOpacity
          onPress={() => logout()}
          style={styles.devLogoutButton}
        >
          <Text style={styles.devLogoutText}>Force Logout</Text>
        </TouchableOpacity>
      )}
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
    backgroundColor: 'rgba(109, 216, 50, 0.28)',
    top: 40,
    right: -50,
  },
  // ● Bottom-left — brand green highlight
  blobB: {
    width: 320,
    height: 320,
    backgroundColor: 'rgba(109, 216, 50, 0.20)',
    bottom: -80,
    left: -80,
  },
  // ● Middle-right — brand green highlight
  blobC: {
    width: 250,
    height: 250,
    backgroundColor: 'rgba(109, 216, 50, 0.16)',
    top: '45%',
    right: -40,
  },

  // 2. Added missing dev button styles
  devLogoutButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 999,
  },
  devLogoutText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
})