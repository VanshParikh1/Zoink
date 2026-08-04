import React from 'react'
import { View, StyleSheet } from 'react-native'
import { theme } from '../theme/colors'

interface Props {
  children: React.ReactNode
  style?: any
}

export default function ScreenBackground({ children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.screen,
  },
})
