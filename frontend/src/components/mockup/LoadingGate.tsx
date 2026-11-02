import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import LogoPill from './LogoPill'

/** Full-screen wait while the app boots (session check, fonts, pending reviews). No text, so it works before fonts load. */
export default function LoadingGate() {
  return (
    <View style={styles.screen} accessibilityLabel="Loading">
      <LogoPill size="lg" style={styles.logo} />
      <ActivityIndicator size="large" color={colors.ink} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
    backgroundColor: colors.bg,
  },
  logo: {
    alignSelf: 'center',
  },
})
